import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Shield } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold">Privacy Policy</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Privacy Policy</CardTitle>
            <p className="text-sm text-muted-foreground">
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-200px)] pr-4">
              <div className="space-y-6">
                <section>
                  <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Welcome to Didi Now Worker App. We respect your privacy and are committed to protecting your personal data. 
                    This privacy policy explains how we collect, use, and safeguard your information when you use our worker application.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold mb-2">2.1 Personal Information</h3>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>Full name</li>
                        <li>Phone number</li>
                        <li>UPI ID (for payment purposes)</li>
                        <li>Profile photo</li>
                        <li>Community and service preferences</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">2.2 Location Data</h3>
                      <p className="text-muted-foreground leading-relaxed ml-4">
                        We collect your real-time location data to match you with nearby service requests and track your location 
                        during active bookings. Location tracking operates in the background when you are available for work.
                      </p>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">2.3 Booking Information</h3>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>Service details and timing</li>
                        <li>Customer information (name, phone, address)</li>
                        <li>Booking status and completion data</li>
                        <li>Earnings and payment information</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">2.4 Device Information</h3>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>Device model and operating system</li>
                        <li>Push notification tokens</li>
                        <li>App version and usage data</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
                  <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                    <li>To connect you with service requests in your area</li>
                    <li>To track your location during active bookings for safety and verification</li>
                    <li>To send you booking alerts and notifications</li>
                    <li>To process payments and track your earnings</li>
                    <li>To maintain and improve our services</li>
                    <li>To communicate with you about bookings and account updates</li>
                    <li>To ensure safety and prevent fraudulent activities</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">4. Location Tracking</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    <strong>Why we track location:</strong>
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4 mb-3">
                    <li>To match you with nearby service requests</li>
                    <li>To verify your arrival at customer locations</li>
                    <li>To provide safety monitoring during active bookings</li>
                    <li>To calculate distance-based compensation</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    <strong>Location tracking operates:</strong>
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>In the background when you mark yourself as available</li>
                    <li>During active bookings</li>
                    <li>You can disable availability to stop location tracking</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">5. Push Notifications</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We send push notifications for time-sensitive booking alerts, status updates, and important account information. 
                    You can manage notification preferences in your device settings. Note that disabling notifications may affect 
                    your ability to receive booking requests promptly.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">6. Data Sharing</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    We share your information only when necessary:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li><strong>With Customers:</strong> Your name, phone number, and photo are shared with customers when you accept a booking</li>
                    <li><strong>With Service Providers:</strong> Payment processors receive necessary information to process earnings</li>
                    <li><strong>Legal Requirements:</strong> We may disclose information if required by law or to protect rights and safety</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    We do NOT sell your personal information to third parties.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">7. Data Security</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We implement appropriate security measures to protect your data from unauthorized access, alteration, 
                    disclosure, or destruction. However, no method of transmission over the internet is 100% secure, and 
                    we cannot guarantee absolute security.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">8. Data Retention</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We retain your personal data for as long as necessary to provide services, comply with legal obligations, 
                    resolve disputes, and enforce agreements. Booking and earnings data are retained for accounting and 
                    legal purposes for a minimum of 7 years.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">9. Your Rights</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">You have the right to:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Access your personal data</li>
                    <li>Correct inaccurate data</li>
                    <li>Request deletion of your data (subject to legal requirements)</li>
                    <li>Withdraw consent for location tracking or notifications</li>
                    <li>Export your data</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    To exercise these rights, contact us through the app or use the account deletion feature in your profile settings.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">10. Children's Privacy</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Our services are not intended for individuals under 18 years of age. We do not knowingly collect 
                    personal information from children.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">11. Changes to This Policy</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We may update this privacy policy from time to time. We will notify you of any changes by posting 
                    the new policy in the app and updating the "Last updated" date. Your continued use of the app 
                    after changes constitutes acceptance of the updated policy.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">12. Contact Us</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    If you have questions about this privacy policy or our data practices, please contact us:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4 mt-2">
                    <li>Through the in-app Contact & Support page</li>
                    <li>Email: support@didinow.com</li>
                    <li>Phone: +91 XXXX-XXXXXX</li>
                  </ul>
                </section>

                <section className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground italic">
                    By using the Didi Now Worker App, you acknowledge that you have read and understood this Privacy Policy 
                    and agree to the collection, use, and disclosure of your information as described herein.
                  </p>
                </section>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
