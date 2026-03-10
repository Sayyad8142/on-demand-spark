import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function HowToGetMoreBookingsCard() {
  const { t } = useTranslation();

  const tips = [
    t("profile.tips.tip1"),
    t("profile.tips.tip2"),
    t("profile.tips.tip3"),
    t("profile.tips.tip4"),
    t("profile.tips.tip5"),
  ];

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="w-5 h-5 text-primary" />
          {t("profile.tips.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {tips.map((tip, i) => (
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
