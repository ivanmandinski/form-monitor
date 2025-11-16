<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class SettingsController extends Controller
{
    /**
     * Display the settings page.
     */
    public function index()
    {
        $settings = config('form-monitor');
        return view('admin.settings.index', compact('settings'));
    }

    /**
     * Update the settings.
     */
    public function update(Request $request)
    {
        $validated = $request->validate([
            'user_agent' => 'required|string|max:255',
            'timeouts.http' => 'required|integer|min:5|max:300',
            'timeouts.dusk' => 'required|integer|min:10|max:600',
            'concurrency.max_per_host' => 'required|integer|min:1|max:10',
            'concurrency.global_max' => 'required|integer|min:1|max:50',
            'politeness.delay_between_requests' => 'required|numeric|min:0|max:10',
            'politeness.delay_per_host' => 'required|numeric|min:0|max:30',
            'artifacts.retention_days' => 'required|integer|min:1|max:365',
            'artifacts.max_html_size' => 'required|integer|min:1024|max:10485760',
        ]);

        // Store settings in cache for now (in production, you'd use a database table)
        Cache::put('form-monitor-settings', $validated, now()->addDays(30));

        return redirect()->route('admin.settings.index')
            ->with('success', 'Settings updated successfully.');
    }
}
