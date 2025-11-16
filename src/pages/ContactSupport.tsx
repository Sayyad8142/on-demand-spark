import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Phone, Mail, MessageCircle, HelpCircle, Send, CheckCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FAQ_ITEMS = [
  {
    question: "How do I receive booking alerts?",
    answer: "Make sure you have enabled push notifications and location permissions. Mark yourself as 'Available' in the app to receive booking alerts for your service areas."
  },
  {
    question: "When will I get paid?",
    answer: "Payments are processed after you mark a booking as completed and the customer confirms. The payment is transferred to your registered UPI ID within 24-48 hours."
  },
  {
    question: "Can I cancel a booking after accepting?",
    answer: "Yes, but frequent cancellations may affect your account standing. Please cancel only in genuine emergencies and inform the customer immediately."
  },
  {
    question: "How are ratings calculated?",
    answer: "Customers rate you after each completed service on a scale of 1-5 stars. Your average rating is displayed on your profile and affects your booking priority."
  },
  {
    question: "What if I'm running late?",
    answer: "Contact the customer immediately through the booking details. Update your status to 'On the way' when you leave, so they can track your progress."
  },
  {
    question: "How do I update my service areas?",
    answer: "Go to Profile → Edit Profile → Communities, and select the areas where you want to receive bookings."
  },
  {
    question: "Why am I not getting booking alerts?",
    answer: "Check: 1) You're marked as Available, 2) Location permissions are enabled, 3) Push notifications are enabled, 4) You have selected service types and communities in your profile."
  },
  {
    question: "How do I change my UPI ID?",
    answer: "Go to Profile → Edit Profile → UPI ID and update your payment information."
  }
];

const CONTACT_INFO = {
  phone: "+91 8008180018",
  email: "team@didisnow.com",
  hours: "Monday to Saturday, 9:00 AM - 7:00 PM",
  emergencyNote: "For urgent booking issues, contact us immediately via phone."
};

export default function ContactSupport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!category || !subject.trim() || !message.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      setSubmitting(true);

      const { error } = await supabase
        .from('feedback')
        .insert({
          user_id: user?.id || '',
          category: category,
          message: `Subject: ${subject}\n\n${message}`,
          rating: null,
          booking_id: null
        });

      if (error) throw error;

      setSubmitted(true);
      toast.success("Support request submitted successfully");
      
      // Reset form
      setTimeout(() => {
        setCategory("");
        setSubject("");
        setMessage("");
        setSubmitted(false);
      }, 3000);
    } catch (error: any) {
      console.error('Error submitting support request:', error);
      toast.error("Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
            <MessageCircle className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold">Contact & Support</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-20">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Contact Information
            </CardTitle>
            <CardDescription>
              Get in touch with our support team
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
              <Phone className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Phone Support</p>
                <a href={`tel:${CONTACT_INFO.phone}`} className="text-primary hover:underline">
                  {CONTACT_INFO.phone}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
              <Mail className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Email Support</p>
                <a href={`mailto:${CONTACT_INFO.email}`} className="text-primary hover:underline">
                  {CONTACT_INFO.email}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
              <Clock className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Support Hours</p>
                <p className="text-sm text-muted-foreground">{CONTACT_INFO.hours}</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-900 dark:text-amber-100">
                <strong>Emergency:</strong> {CONTACT_INFO.emergencyNote}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Frequently Asked Questions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5" />
              Frequently Asked Questions
            </CardTitle>
            <CardDescription>
              Quick answers to common questions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {FAQ_ITEMS.map((item, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* Submit Support Request */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Submit Support Request
            </CardTitle>
            <CardDescription>
              Can't find what you're looking for? Send us a message
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Request Submitted!</h3>
                <p className="text-muted-foreground">
                  We'll get back to you within 24 hours.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select issue category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="booking_issue">Booking Issue</SelectItem>
                      <SelectItem value="payment_issue">Payment Issue</SelectItem>
                      <SelectItem value="app_technical">Technical Problem</SelectItem>
                      <SelectItem value="account_help">Account Help</SelectItem>
                      <SelectItem value="customer_complaint">Customer Complaint</SelectItem>
                      <SelectItem value="feature_request">Feature Request</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Subject *</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Brief description of your issue"
                    maxLength={100}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message *</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Provide details about your issue or question..."
                    rows={6}
                    maxLength={1000}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {message.length}/1000 characters
                  </p>
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={submitting || !category || !subject.trim() || !message.trim()}
                >
                  {submitting ? (
                    <>Submitting...</>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit Request
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  We typically respond within 24 hours during business days
                </p>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Additional Resources */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Resources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/privacy-policy')}
            >
              Privacy Policy
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/terms-of-service')}
            >
              Terms of Service
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/troubleshoot')}
            >
              Troubleshooting Guide
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
