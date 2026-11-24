# Mandatory update presentation

## SOURCE
Mandatory-only redesign of the existing shared screen: white background, large green download icon in light-green circle, App Update Required heading, green Update Now control and separate circular phone link to `tel:8008180018`. No logo, explanatory paragraph, build-number panel or visible support text. Optional update presentation remains unchanged.

No Admin integration, version validation, Store helper, active-work/OTP safety, native Back listener or mandatory-dismissal rules changed. No hardcoded builds; no production switch, APK/AAB, backend or publishing action.

## AUTOMATED
65 tests passed in WorkerUpdateScreen, updateDecision, updateSafety and liveUpdateCycle. New rule test asserts the exact requested dialer URI. Existing tests cover mandatory Back/Escape refusal, optional Back dismissal and duplicate Store taps. Current preview log: build OK. Reported use-mobile error not reproduced; explicit imports already correct.

## BROWSER
Actual component rendered in an isolated localhost fixture, not a public app route. Inspected 393×805, 320×568, 360×640, 412×915, 1280×1800 and 568×320; controls fit without horizontal overflow. English/Hindi/Telugu inspected. Mandatory Escape retains the screen. Update Now opened the unchanged official `https://play.google.com/store/apps/details?id=app.didisnow.worker` in a new browser window. No page errors. Dialer link carries the exact requested number, with accessible translated name and tooltip but no visible number/text.

## NOT VERIFIED
Actual Android dialer launch, native Play app fallback and a signed-in mandatory gate: physical phone/current signed app and unmanaged session unavailable. No forced update enabled just to preview this screen. Nothing published.