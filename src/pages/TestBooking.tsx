import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { showTestBookingAlert } from "@/native/bookingAlert";

export default function TestBooking() {
  const [bookingData, setBookingData] = useState({
    service_type: "maid",
    flat_number: "9198",
    price_inr: "150",
    notes: "Dishes + Jhaadu/Pocha",
  });

  const handleSendTest = async () => {
    try {
      const result = await showTestBookingAlert();
      
      if (result.success) {
        toast({
          title: "Test Booking Sent",
          description: result.message || "Check your device for the overlay",
        });
      } else {
        toast({
          title: "Failed to Send Test",
          description: result.error || "Something went wrong",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Test booking error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send test booking",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Test Booking Overlay</CardTitle>
            <CardDescription>
              Send a test booking notification to trigger the native Android overlay
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="service_type">Service Type</Label>
              <Select
                value={bookingData.service_type}
                onValueChange={(value) =>
                  setBookingData((prev) => ({ ...prev, service_type: value }))
                }
              >
                <SelectTrigger id="service_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maid">Maid Service</SelectItem>
                  <SelectItem value="cook">Cook Service</SelectItem>
                  <SelectItem value="bathroom">Bathroom Cleaning</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="flat_number">Flat Number</Label>
              <Input
                id="flat_number"
                value={bookingData.flat_number}
                onChange={(e) =>
                  setBookingData((prev) => ({ ...prev, flat_number: e.target.value }))
                }
                placeholder="e.g., 9198"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price_inr">Price (₹)</Label>
              <Input
                id="price_inr"
                type="number"
                value={bookingData.price_inr}
                onChange={(e) =>
                  setBookingData((prev) => ({ ...prev, price_inr: e.target.value }))
                }
                placeholder="150"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={bookingData.notes}
                onChange={(e) =>
                  setBookingData((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="e.g., Dishes + Jhaadu/Pocha"
              />
            </div>

            <Button onClick={handleSendTest} className="w-full" size="lg">
              Send Test Booking
            </Button>

            <div className="text-sm text-muted-foreground mt-4">
              <p className="font-semibold mb-2">Test Details:</p>
              <ul className="space-y-1">
                <li>• Service: {bookingData.service_type}</li>
                <li>• Tower No: {bookingData.flat_number.trim()[0] || "—"}</li>
                <li>• Price: ₹{bookingData.price_inr}</li>
                <li>• Community: Prestige High Fields</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
