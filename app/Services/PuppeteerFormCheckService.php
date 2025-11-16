<?php

namespace App\Services;

use App\Models\FormTarget;
use App\Models\CheckRun;
use App\Models\CheckArtifact;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;
use Symfony\Component\Process\Exception\ProcessFailedException;

class PuppeteerFormCheckService
{
    private string $puppeteerScript;
    private int $timeout;

    public function __construct()
    {
        $this->puppeteerScript = resource_path('js/puppeteer-form-checker.js');
        $this->timeout = config('form-monitor.timeouts.puppeteer', 120); // 2 minutes
    }

    public function checkForm(FormTarget $formTarget): CheckRun
    {
        // Set PHP execution time limit for this process
        $originalTimeLimit = ini_get('max_execution_time');
        $timeout = config('form-monitor.timeouts.puppeteer', 300);
        set_time_limit($timeout);
        
        $checkRun = CheckRun::create([
            'form_target_id' => $formTarget->id,
            'driver' => 'puppeteer',
            'status' => 'pending',
            'started_at' => now(),
        ]);

        try {
            $result = $this->runPuppeteerCheck($formTarget);
            
            Log::info('Processing Puppeteer result', [
                'form_target_id' => $formTarget->id,
                'success' => $result['success'] ?? 'undefined',
                'status' => $result['status'] ?? 'undefined',
                'finalUrl' => $result['finalUrl'] ?? 'undefined',
                'has_html' => isset($result['html']),
                'result_keys' => array_keys($result),
            ]);

            $checkRun->update([
                'status' => $this->mapStatus($result['status'] ?? 'unknown'),
                'final_url' => $result['finalUrl'] ?? null,
                'message_excerpt' => $result['message'] ?? null,
                'error_detail' => $result['success'] ? null : ['error' => $result['error'] ?? 'Unknown error'],
                'finished_at' => now(),
            ]);

            // Store artifacts
            if (isset($result['html'])) {
                Log::info('Storing HTML artifact', [
                    'form_target_id' => $formTarget->id,
                    'html_length' => strlen($result['html']),
                ]);
                $this->storeArtifact($checkRun, 'html', $result['html']);
            } else {
                Log::warning('No HTML content found in Puppeteer result', [
                    'form_target_id' => $formTarget->id,
                    'result_keys' => array_keys($result),
                ]);
            }

            // Store debug info if there was an error
            if (isset($result['debugInfo'])) {
                $this->storeArtifact($checkRun, CheckArtifact::TYPE_DEBUG_INFO, json_encode($result['debugInfo']));
            }

        } catch (\Exception $e) {
            Log::error('Puppeteer form check failed', [
                'form_target_id' => $formTarget->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            $checkRun->update([
                'status' => CheckRun::STATUS_ERROR,
                'error_detail' => [
                    'message' => $e->getMessage(),
                    'trace' => $e->getTraceAsString(),
                ],
                'finished_at' => now(),
            ]);
        } finally {
            // Restore original PHP execution time limit
            if (isset($originalTimeLimit)) {
                set_time_limit($originalTimeLimit);
            }
        }

        return $checkRun;
    }

    private function runPuppeteerCheck(FormTarget $formTarget): array
    {
        // Prepare configuration for Puppeteer script
        $config = [
            'url' => $formTarget->target->url,
            'selectorType' => $formTarget->selector_type,
            'selectorValue' => $formTarget->selector_value,
            'fieldMappings' => $formTarget->fieldMappings->map(function ($mapping) {
                return [
                    'selector' => $mapping->selector,
                    'value' => $mapping->value,
                    'type' => $mapping->type ?? 'text',
                    'clearFirst' => $mapping->clear_first ?? true,
                    'delay' => $mapping->delay ?? 100,
                ];
            })->toArray(),
            'successSelector' => $formTarget->success_selector,
            'errorSelector' => $formTarget->error_selector,
            'timeout' => $this->timeout * 1000, // Convert to milliseconds
            'waitForJavaScript' => $formTarget->uses_js ?? true,
            'executeJavaScript' => $formTarget->execute_javascript ?? null,
            'waitForElements' => $formTarget->wait_for_elements ?? [],
            'customActions' => $formTarget->custom_actions ?? [],
        ];

        $configJson = json_encode($config);

        // Create the process
        $process = new Process([
            'node',
            $this->puppeteerScript,
            $configJson
        ]);

        $process->setTimeout($this->timeout);
        $process->setWorkingDirectory(base_path());

        // Set environment variables
        $env = $_ENV;
        $env['PUPPETEER_HEADLESS'] = config('form-monitor.puppeteer.headless', 'true');
        $env['CAPTCHA_SOLVER_API_KEY'] = config('form-monitor.captcha.api_key', '');
        $process->setEnv($env);

        Log::info('Running Puppeteer form check', [
            'form_target_id' => $formTarget->id,
            'url' => $formTarget->target->url,
        ]);

        try {
            $process->mustRun();
            $output = $process->getOutput();
            
            // Parse the JSON output
            $result = json_decode($output, true);
            
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new \Exception('Invalid JSON output from Puppeteer: ' . $output);
            }

            Log::info('Puppeteer form check completed', [
                'form_target_id' => $formTarget->id,
                'status' => $result['status'] ?? 'unknown',
                'captcha_detected' => $result['captchaDetected'] ?? false,
                'success' => $result['success'] ?? false,
                'final_url' => $result['finalUrl'] ?? null,
                'message' => $result['message'] ?? null,
            ]);

            return $result;

        } catch (ProcessFailedException $e) {
            $errorOutput = $process->getErrorOutput();
            $standardOutput = $process->getOutput();
            
            Log::error('Puppeteer process failed', [
                'form_target_id' => $formTarget->id,
                'error' => $e->getMessage(),
                'stderr' => $errorOutput,
                'stdout' => $standardOutput,
            ]);

            throw new \Exception('Puppeteer process failed: ' . $errorOutput ?: $e->getMessage());
        }
    }

    private function mapStatus(string $puppeteerStatus): string
    {
        return match($puppeteerStatus) {
            'success' => CheckRun::STATUS_SUCCESS,
            'failure' => CheckRun::STATUS_FAILURE,
            'blocked' => CheckRun::STATUS_BLOCKED,
            'error' => CheckRun::STATUS_ERROR,
            'unknown' => CheckRun::STATUS_SUCCESS, // Treat unknown as success since form was submitted
            default => CheckRun::STATUS_SUCCESS, // Default to success for any other status
        };
    }

    private function storeArtifact(CheckRun $checkRun, string $type, string $content, bool $isBase64 = false): void
    {
        try {
            $extension = match($type) {
                'html' => 'html',
                'debug_info' => 'json',
                'screenshot' => 'png',
                default => 'txt',
            };
            
            $filename = 'artifacts/' . uniqid() . '_' . $checkRun->id . '_' . $type . '.' . $extension;
            
            if ($isBase64) {
                // Decode base64 content for images
                $binaryContent = base64_decode($content);
                Storage::disk('public')->put($filename, $binaryContent);
            } else {
                // Store as-is for HTML, JSON, or text
                Storage::disk('public')->put($filename, $content);
            }
            
            // Verify the file was actually created before creating the database record
            if (!Storage::disk('public')->exists($filename)) {
                throw new \Exception("Failed to create artifact file: {$filename}");
            }
            
            // Only create database record if file was successfully created
            CheckArtifact::create([
                'check_run_id' => $checkRun->id,
                'type' => $type,
                'path' => $filename,
            ]);
            
            Log::info('Artifact stored successfully', [
                'check_run_id' => $checkRun->id,
                'type' => $type,
                'filename' => $filename,
                'file_size' => Storage::disk('public')->size($filename),
            ]);
            
        } catch (\Exception $e) {
            Log::error('Failed to store artifact', [
                'check_run_id' => $checkRun->id,
                'type' => $type,
                'error' => $e->getMessage(),
            ]);
            
            // Re-throw the exception so the calling method can handle it
            throw $e;
        }
    }

    public function isAvailable(): bool
    {
        try {
            // Check if Node.js is available
            $process = new Process(['node', '--version']);
            $process->run();
            
            if (!$process->isSuccessful()) {
                return false;
            }

            // Check if the Puppeteer script exists
            if (!file_exists($this->puppeteerScript)) {
                return false;
            }

            // Check if Puppeteer is installed
            $process = new Process(['node', '-e', 'require("puppeteer")']);
            $process->run();
            
            return $process->isSuccessful();
        } catch (\Exception $e) {
            Log::warning('Puppeteer availability check failed', ['error' => $e->getMessage()]);
            return false;
        }
    }
}
