import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, CheckCircle } from "lucide-react";

const TIPS = [
  "Accept booking requests quickly",
  "Stay online longer to receive more offers",
  "Complete more bookings every week",
  "Maintain rating above 4.5★",
  "Avoid rejecting booking alerts",
];

export default function HowToGetMoreBookingsCard() {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="w-5 h-5 text-primary" />
          How To Get More Bookings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {TIPS.map((tip, i) => (
            <li key={i} className="flex items-start gap-3">
              <CheckCircle className="w-4.5 h-4.5 text-primary mt-0.5 shrink-0" />
              <span className="text-sm text-foreground">{tip}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
