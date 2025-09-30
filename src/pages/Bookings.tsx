import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Search, MapPin, Calendar, Loader2 } from "lucide-react";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

export default function Bookings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!user) return;

    const fetchBookings = async () => {
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('worker_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setBookings(data || []);
      } catch (error) {
        console.error('Error fetching bookings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, [user]);

  const today = new Date().toISOString().split('T')[0];
  
  const upcomingBookings = bookings.filter(b => 
    ['accepted', 'on_the_way', 'started'].includes(b.status) ||
    (b.scheduled_date && b.scheduled_date >= today)
  );

  const historyBookings = bookings.filter(b => 
    ['completed', 'cancelled'].includes(b.status)
  );

  const filteredUpcoming = upcomingBookings.filter(b =>
    b.cust_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.community.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.flat_no.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredHistory = historyBookings.filter(b =>
    b.cust_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.community.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.flat_no.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    const colors = {
      'accepted': 'bg-blue-100 text-blue-700',
      'on_the_way': 'bg-purple-100 text-purple-700',
      'started': 'bg-green-100 text-green-700',
      'completed': 'bg-emerald-100 text-emerald-700',
      'cancelled': 'bg-gray-100 text-gray-700'
    };
    return colors[status as keyof typeof colors] || 'bg-secondary';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/home")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">My Bookings</h1>
              <p className="text-sm text-muted-foreground">View your job history</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, community, or flat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto p-4">
        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="upcoming">
              Upcoming ({filteredUpcoming.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              History ({filteredHistory.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {filteredUpcoming.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No upcoming bookings</h3>
                <p className="text-sm text-muted-foreground">Your completed jobs will appear here</p>
              </div>
            ) : (
              filteredUpcoming.map(booking => (
                <BookingCard key={booking.id} booking={booking} getStatusColor={getStatusColor} />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No booking history</h3>
                <p className="text-sm text-muted-foreground">Your completed jobs will appear here</p>
              </div>
            ) : (
              filteredHistory.map(booking => (
                <BookingCard key={booking.id} booking={booking} getStatusColor={getStatusColor} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function BookingCard({ booking, getStatusColor }: { booking: Booking; getStatusColor: (status: string) => string }) {
  return (
    <Card className="p-4 shadow-card hover:shadow-pink transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{booking.cust_name}</h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="w-3 h-3" />
            {booking.community} • {booking.flat_no}
          </div>
        </div>
        <Badge className={getStatusColor(booking.status)}>
          {booking.status.replace('_', ' ')}
        </Badge>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {booking.service_type.replace('_', ' ')}
          </span>
          {booking.created_at && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {new Date(booking.created_at).toLocaleDateString()}
            </div>
          )}
        </div>
        {booking.price_inr && (
          <span className="font-bold text-primary">₹{booking.price_inr}</span>
        )}
      </div>
    </Card>
  );
}