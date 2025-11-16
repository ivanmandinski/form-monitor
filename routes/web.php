<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Admin\TargetController;
use App\Http\Controllers\Admin\FormTargetController;
use App\Http\Controllers\Admin\FieldMappingController;
use App\Http\Controllers\Admin\CheckRunController;
use App\Http\Controllers\Admin\SettingsController;

// Redirect root to login if not authenticated, or to appropriate dashboard if authenticated
Route::get('/', function () {
    if (!auth()->check()) {
        return redirect()->route('login');
    }
    
    // If authenticated, redirect based on role
    if (auth()->user()->hasRole('admin')) {
        return redirect()->route('admin.dashboard');
    }
    
    // For regular users, redirect to dashboard
    return redirect()->route('dashboard');
})->name('home');

Route::view('dashboard', 'dashboard')
    ->middleware(['auth', 'verified'])
    ->name('dashboard');

Route::view('profile', 'profile')
    ->middleware(['auth'])
    ->name('profile');

// Admin routes
Route::middleware(['auth', 'admin'])->prefix('admin')->name('admin.')->group(function () {
    Route::view('dashboard', 'admin.dashboard')->name('dashboard');
    
    // Targets
    Route::resource('targets', TargetController::class);
    
    // Forms
    Route::resource('forms', FormTargetController::class);
    Route::post('forms/{form}/run', [FormTargetController::class, 'run'])->name('forms.run');
    
    // Field Mappings
    Route::resource('field-mappings', FieldMappingController::class);
    
    // Check Runs
    Route::resource('runs', CheckRunController::class)->only(['index', 'show', 'destroy']);
    
    // Settings
    Route::get('settings', [SettingsController::class, 'index'])->name('settings.index');
    Route::post('settings', [SettingsController::class, 'update'])->name('settings.update');
});

require __DIR__.'/auth.php';
