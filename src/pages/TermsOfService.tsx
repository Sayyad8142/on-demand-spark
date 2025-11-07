import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function TermsOfService() {
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
            <FileText className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold">Terms of Service</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Terms of Service</CardTitle>
            <p className="text-sm text-muted-foreground">
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-200px)] pr-4">
              <div className="space-y-6">
                <section>
                  <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    By accessing and using the Didi Now Worker App, you accept and agree to be bound by these Terms of Service. 
                    If you do not agree to these terms, please do not use the app.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">2. Service Description</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    Didi Now provides a platform connecting service workers with customers requiring household services including:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Maid/cleaning services</li>
                    <li>Cooking services</li>
                    <li>Bathroom cleaning services</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    As a worker, you can receive, accept, and complete service bookings through the app.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">3. Worker Eligibility</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">To use this app, you must:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Be at least 18 years of age</li>
                    <li>Have the legal right to work in your location</li>
                    <li>Provide accurate registration information</li>
                    <li>Maintain a valid phone number</li>
                    <li>Have the skills and qualifications for the services you offer</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">4. Account Responsibilities</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">You are responsible for:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Maintaining the confidentiality of your account</li>
                    <li>Keeping your profile information accurate and up-to-date</li>
                    <li>All activities that occur under your account</li>
                    <li>Notifying us immediately of any unauthorized use</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">5. Service Standards</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">As a worker, you agree to:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Provide services professionally and to the best of your ability</li>
                    <li>Arrive on time for scheduled bookings</li>
                    <li>Treat customers and their property with respect</li>
                    <li>Follow all safety and hygiene standards</li>
                    <li>Complete bookings as agreed</li>
                    <li>Communicate promptly with customers and platform administrators</li>
                    <li>Update your availability status accurately</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">6. Booking Acceptance & Cancellation</h2>
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold mb-2">6.1 Accepting Bookings</h3>
                      <p className="text-muted-foreground leading-relaxed ml-4">
                        When you accept a booking, you commit to completing the service as scheduled. You should only 
                        accept bookings that you can fulfill.
                      </p>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">6.2 Cancellations</h3>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>Frequent cancellations may result in account suspension</li>
                        <li>Emergency cancellations should be communicated immediately</li>
                        <li>You must provide valid reasons for cancellations</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">7. Payments & Earnings</h2>
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold mb-2">7.1 Payment Processing</h3>
                      <p className="text-muted-foreground leading-relaxed ml-4">
                        Payments are processed through the platform. You must provide accurate UPI information for receiving payments.
                      </p>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">7.2 Earnings</h3>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>Earnings are calculated based on completed bookings</li>
                        <li>Payment timing and methods are subject to platform policies</li>
                        <li>You are responsible for applicable taxes on your earnings</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">7.3 Direct Payments</h3>
                      <p className="text-muted-foreground leading-relaxed ml-4">
                        Accepting payment outside the platform is strictly prohibited and may result in account termination.
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">8. Location Tracking</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    By using this app, you consent to location tracking when you are marked as available or during active bookings. 
                    This is necessary for matching you with nearby requests and ensuring safety. You can disable location tracking 
                    by marking yourself as unavailable.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">9. Ratings & Reviews</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    Customers can rate and review your services. You understand that:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Ratings and reviews are visible on your profile</li>
                    <li>Consistently poor ratings may affect your account standing</li>
                    <li>You cannot delete or modify customer reviews</li>
                    <li>You can report inappropriate reviews for investigation</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">10. Prohibited Conduct</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">You must NOT:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>Harass, abuse, or discriminate against customers</li>
                    <li>Provide false information or impersonate others</li>
                    <li>Accept payments outside the platform</li>
                    <li>Solicit customers to use competing services</li>
                    <li>Share your account with others</li>
                    <li>Manipulate ratings or reviews</li>
                    <li>Engage in fraudulent activities</li>
                    <li>Violate any applicable laws or regulations</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">11. Safety & Insurance</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    You are responsible for your own safety and insurance. Didi Now does not provide insurance coverage for 
                    workers. You should maintain appropriate insurance coverage and follow all safety protocols.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">12. Independent Contractor Status</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    You are an independent contractor, not an employee of Didi Now. You are responsible for your own taxes, 
                    insurance, and compliance with local regulations. This agreement does not create an employment relationship.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">13. Account Suspension & Termination</h2>
                  <p className="text-muted-foreground leading-relaxed mb-2">
                    We reserve the right to suspend or terminate your account if:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>You violate these terms</li>
                    <li>You engage in fraudulent or illegal activities</li>
                    <li>You receive consistently poor ratings</li>
                    <li>You cancel bookings excessively</li>
                    <li>You fail to maintain service standards</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    You may also delete your account at any time through the profile settings.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">14. Intellectual Property</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    All content, features, and functionality of the app are owned by Didi Now and are protected by 
                    intellectual property laws. You may not copy, modify, or distribute any part of the app without permission.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">15. Limitation of Liability</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Didi Now is not liable for any indirect, incidental, special, or consequential damages arising from your 
                    use of the app or services. Our total liability is limited to the amount you have earned through the platform 
                    in the past 3 months.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">16. Dispute Resolution</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Any disputes arising from these terms shall be resolved through binding arbitration in accordance with 
                    local laws. You agree to resolve disputes individually and waive any right to participate in class actions.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">17. Changes to Terms</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    We may modify these terms at any time. We will notify you of significant changes through the app. 
                    Continued use after changes constitutes acceptance of the modified terms.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">18. Governing Law</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    These terms are governed by the laws of India. Any legal action must be brought in the courts of 
                    [Your jurisdiction].
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-3">19. Contact Information</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    For questions about these Terms of Service, contact us:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4 mt-2">
                    <li>Through the in-app Contact & Support page</li>
                    <li>Email: support@didinow.com</li>
                    <li>Phone: +91 XXXX-XXXXXX</li>
                  </ul>
                </section>

                <section className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground italic">
                    By using the Didi Now Worker App, you acknowledge that you have read, understood, and agree to be bound 
                    by these Terms of Service.
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
