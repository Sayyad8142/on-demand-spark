import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, FlaskConical, MapPin, Clock, IndianRupee, CheckCircle2 } from "lucide-react";

type Step = "intro" | "alert" | "details" | "otp" | "done";

const TRAINING_OTP = "1234";

/**
 * Worker Training / Test Booking Mode.
 * Fully local simulation — creates no real booking and touches no backend data.
 */
export default function TestBooking() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("intro");
  const [seconds, setSeconds] = useState(30);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (step !== "alert") return;
    setSeconds(30);
    const id = setInterval(() => {
      setSeconds((s) => (s <= 1 ? 30 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const submitOtp = () => {
    if (otp.trim() === TRAINING_OTP) {
      setError("");
      setStep("done");
    } else {
      setError("Incorrect test OTP. For training, use 1234.");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/profile")} aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="font-bold text-base flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" /> Test Booking
          </h1>
          <p className="text-xs text-muted-foreground">Training only — not a real booking</p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 px-4 py-2.5 text-xs font-semibold">
          Practice mode. Nothing here affects your earnings, ratings or real bookings.
        </div>

        {step === "intro" && (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-5 space-y-4">
              <h2 className="text-lg font-bold">How It Works</h2>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal pl-5">
                <li>You get a booking alert with address and amount</li>
                <li>Tap Accept before the timer ends</li>
                <li>Reach the flat and start the job</li>
                <li>Ask the customer for the OTP and enter it</li>
                <li>Job completed — payment is added to your earnings</li>
              </ol>
              <Button className="w-full h-12 text-base" onClick={() => setStep("alert")}>
                Start Practice
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "alert" && (
          <Card className="border-0 shadow-xl">
            <CardContent className="p-5 space-y-4">
              <div className="text-center">
                <div className="text-xl font-bold">🔔 New Booking!</div>
                <p className="text-xs text-muted-foreground">Sample training request</p>
              </div>
              <div className="bg-muted/60 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">MAID</span>
                  <span className="font-bold text-primary flex items-center">
                    <IndianRupee className="w-4 h-4" />249
                  </span>
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Training Community • Flat A-1204
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Today, right now
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Time left</span>
                  <span className="font-semibold">{seconds}s</span>
                </div>
                <Progress value={((30 - seconds) / 30) * 100} className="h-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-12" onClick={() => setStep("intro")}>
                  Reject
                </Button>
                <Button className="h-12" onClick={() => setStep("details")}>
                  Accept
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "details" && (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-5 space-y-4">
              <h2 className="text-lg font-bold">Job Details</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span className="font-semibold">Maid</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Flat</span><span className="font-semibold">A-1204</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-semibold">Training Customer</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">You earn</span><span className="font-semibold">₹199</span></div>
              </div>
              <Button className="w-full h-12 text-base" onClick={() => setStep("otp")}>
                I've Finished the Job
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "otp" && (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-5 space-y-4">
              <h2 className="text-lg font-bold">Enter Customer OTP</h2>
              <p className="text-sm text-muted-foreground">
                For test bookings, use the fixed training OTP: <span className="font-bold">1234</span>
              </p>
              <Input
                inputMode="numeric"
                maxLength={4}
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 4));
                  setError("");
                }}
                placeholder="1234"
                className="h-14 text-center text-2xl tracking-[0.5em] font-bold"
                aria-label="Customer OTP"
              />
              {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
              <Button className="w-full h-12 text-base" disabled={otp.length !== 4} onClick={submitOtp}>
                Complete Job
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "done" && (
          <Card className="border-0 shadow-xl bg-green-50 dark:bg-green-950 border-green-300">
            <CardContent className="p-6 space-y-4 text-center">
              <CheckCircle2 className="w-14 h-14 mx-auto text-green-600" />
              <h2 className="text-xl font-bold text-green-800 dark:text-green-200">🎉 Training Completed!</h2>
              <p className="text-sm text-green-700 dark:text-green-300">
                You now know how a real booking works. This practice job was not saved anywhere.
              </p>
              <Button className="w-full h-12 text-base" onClick={() => navigate("/profile")}>
                Done
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
