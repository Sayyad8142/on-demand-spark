import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, X, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useDeviceReadiness } from "@/hooks/useDeviceReadiness";

export default function DeviceReadiness() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { checks, loading, hasCriticalFailure, refresh } = useDeviceReadiness(user?.id);

  const statusIcon = (status: string) => {
    switch (status) {
      case "pass": return <Check className="w-5 h-5 text-green-600" />;
      case "fail": return <X className="w-5 h-5 text-red-600" />;
      case "warn": return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default: return <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />;
    }
  };

  const statusBg = (status: string) => {
    switch (status) {
      case "pass": return "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800";
      case "fail": return "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800";
      case "warn": return "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800";
      default: return "bg-muted";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Booking Alerts Setup</h1>
            <p className="text-sm text-muted-foreground">Ensure you never miss a booking</p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-3">
        {hasCriticalFailure && (
          <Card className="p-4 bg-red-50 dark:bg-red-950 border-red-300">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                  Critical issues found
                </p>
                <p className="text-xs text-red-700 dark:text-red-300">
                  Fix the items below or you will miss booking alerts when going online.
                </p>
              </div>
            </div>
          </Card>
        )}

        {checks.map((check, i) => (
          <Card key={i} className={`p-4 ${statusBg(check.status)}`}>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">{statusIcon(check.status)}</div>
              <div className="flex-1">
                <p className="font-medium text-sm">{check.label}</p>
                {check.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
                )}
              </div>
            </div>
          </Card>
        ))}

        {!loading && checks.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No checks available</p>
        )}

        <div className="pt-4">
          <Button className="w-full" onClick={() => navigate("/home")}>
            Back to Home
          </Button>
        </div>
      </main>
    </div>
  );
}
