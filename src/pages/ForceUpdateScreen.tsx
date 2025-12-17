import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी" },
  { code: "te", label: "తెలుగు" },
];

const ForceUpdateScreen = () => {
  const { t, i18n } = useTranslation();

  const handleUpdateNow = () => {
    window.open(
      'https://play.google.com/store/apps/details?id=app.didisnow.worker',
      '_blank'
    );
  };

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <RefreshCw className="w-12 h-12 text-primary" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-foreground">
          {t('forceUpdate.title')}
        </h1>

        {/* Message */}
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t('forceUpdate.message')}
        </p>

        {/* Update Button */}
        <Button
          onClick={handleUpdateNow}
          size="lg"
          className="w-full mt-8"
        >
          {t('forceUpdate.button')}
        </Button>

        {/* Additional info */}
        <p className="text-sm text-muted-foreground mt-4">
          {t('forceUpdate.info')}
        </p>

        {/* Language Toggle */}
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-3">
            {t('profile.selectLanguage')}
          </p>
          <div className="flex justify-center gap-2">
            {LANGUAGES.map((lang) => (
              <Button
                key={lang.code}
                variant={i18n.language === lang.code ? "default" : "outline"}
                size="sm"
                onClick={() => handleLanguageChange(lang.code)}
                className="min-w-[80px]"
              >
                {lang.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForceUpdateScreen;
