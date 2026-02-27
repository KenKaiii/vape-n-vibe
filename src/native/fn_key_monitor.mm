#import <Foundation/Foundation.h>
#import <Carbon/Carbon.h>
#import <ApplicationServices/ApplicationServices.h>
#include <napi.h>
#include <string>

static CFMachPortRef eventTap = NULL;
static CFRunLoopSourceRef runLoopSource = NULL;
static Napi::ThreadSafeFunction tsfn;
static bool keyPressed = false;

CGEventRef eventCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon) {
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (eventTap) CGEventTapEnable(eventTap, true);
        return event;
    }

    if (type == kCGEventFlagsChanged) {
        CGEventFlags flags = CGEventGetFlags(event);
        bool currentKeyState = (flags & kCGEventFlagMaskSecondaryFn) != 0;

        if (currentKeyState != keyPressed) {
            keyPressed = currentKeyState;

            auto callback = [](Napi::Env env, Napi::Function jsCallback, bool* data) {
                std::string eventName = *data ? "FN_KEY_DOWN" : "FN_KEY_UP";
                jsCallback.Call({Napi::String::New(env, eventName)});
            };

            tsfn.BlockingCall(&keyPressed, callback);
        }
    }
    return event;
}

Napi::Value CheckAccessibilityPermissions(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    bool isGranted = AXIsProcessTrusted();

    if (!isGranted) {
        NSDictionary *options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
        isGranted = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    }

    return Napi::Boolean::New(env, isGranted);
}

Napi::Value StartMonitoring(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Callback function required").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!AXIsProcessTrusted()) {
        return Napi::Boolean::New(env, false);
    }

    if (eventTap) {
        CGEventTapEnable(eventTap, false);
        CFRunLoopRemoveSource(CFRunLoopGetMain(), runLoopSource, kCFRunLoopCommonModes);
        CFRelease(runLoopSource);
        CFRelease(eventTap);
        eventTap = NULL;
        runLoopSource = NULL;
    }

    tsfn = Napi::ThreadSafeFunction::New(env, info[0].As<Napi::Function>(), "FnKeyCallback", 0, 1);

    eventTap = CGEventTapCreate(
        kCGSessionEventTap,
        kCGHeadInsertEventTap,
        kCGEventTapOptionDefault,
        CGEventMaskBit(kCGEventFlagsChanged),
        eventCallback,
        NULL
    );

    if (!eventTap) {
        tsfn.Release();
        return Napi::Boolean::New(env, false);
    }

    runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0);
    CFRunLoopAddSource(CFRunLoopGetMain(), runLoopSource, kCFRunLoopCommonModes);
    CGEventTapEnable(eventTap, true);

    return Napi::Boolean::New(env, true);
}

Napi::Value StopMonitoring(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (eventTap) {
        CGEventTapEnable(eventTap, false);
        CFRunLoopRemoveSource(CFRunLoopGetMain(), runLoopSource, kCFRunLoopCommonModes);
        CFRelease(runLoopSource);
        CFRelease(eventTap);
        eventTap = NULL;
        runLoopSource = NULL;
        keyPressed = false;
        tsfn.Release();
    }

    return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "startMonitoring"), Napi::Function::New(env, StartMonitoring));
    exports.Set(Napi::String::New(env, "stopMonitoring"), Napi::Function::New(env, StopMonitoring));
    exports.Set(Napi::String::New(env, "checkAccessibilityPermissions"), Napi::Function::New(env, CheckAccessibilityPermissions));
    return exports;
}

NODE_API_MODULE(fn_key_monitor, Init)
