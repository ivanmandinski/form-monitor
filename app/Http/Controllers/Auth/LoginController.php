<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Livewire\Volt\Volt;

class LoginController extends Controller
{
    /**
     * Handle the login request and redirect based on user role
     */
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);

        if (Auth::attempt($credentials, $request->boolean('remember'))) {
            $request->session()->regenerate();

            // Clear any intended URL to force role-based redirect
            $request->session()->forget('url.intended');

            // Redirect based on user role
            if (Auth::user()->hasRole('admin')) {
                return redirect()->route('admin.dashboard');
            }

            // For regular users, redirect to dashboard
            return redirect()->route('dashboard');
        }

        return back()->withErrors([
            'email' => 'The provided credentials do not match our records.',
        ])->onlyInput('email');
    }

    /**
     * Show the login form
     */
    public function showLoginForm()
    {
        return view('auth.login');
    }
}
