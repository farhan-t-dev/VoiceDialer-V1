import { useQuery } from "@tanstack/react-query";
import { Phone, Users, BarChart3, PhoneCall, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Contact, Campaign, CallHistory } from "@shared/schema";
import { Link } from "wouter";

export default function Home() {
  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: campaigns } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const { data: calls } = useQuery<CallHistory[]>({
    queryKey: ["/api/calls"],
  });

  const totalContacts = contacts?.length || 0;
  const totalCampaigns = campaigns?.length || 0;
  const totalCalls = calls?.length || 0;
  const activeCampaigns = campaigns?.filter(c => c.status === 'active').length || 0;

  const recentCalls = calls?.slice(0, 5) || [];

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b px-6 backdrop-blur supports-[backdrop-filter]:bg-background/95">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <Phone className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Google Voice Dialer</h1>
            <p className="text-xs text-muted-foreground">Dashboard Overview</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Link href="/contacts">
            <Button variant="outline" data-testid="button-contacts">
              <Users className="h-4 w-4 mr-2" />
              Contacts
            </Button>
          </Link>
          <Link href="/campaigns">
            <Button variant="outline" data-testid="button-campaigns">
              <PhoneCall className="h-4 w-4 mr-2" />
              Campaigns
            </Button>
          </Link>
          <Link href="/analytics">
            <Button variant="outline" data-testid="button-analytics">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Welcome to your Google Voice Dialer management center
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card data-testid="card-total-contacts">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-contacts">{totalContacts}</div>
              <p className="text-xs text-muted-foreground">
                Contacts in your database
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-total-campaigns">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
              <PhoneCall className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-campaigns">{totalCampaigns}</div>
              <p className="text-xs text-muted-foreground">
                {activeCampaigns} active campaigns
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-total-calls">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-calls">{totalCalls}</div>
              <p className="text-xs text-muted-foreground">
                All-time call history
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-recent-activity">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-recent-calls">{recentCalls.length}</div>
              <p className="text-xs text-muted-foreground">
                Calls in last session
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="hover-elevate active-elevate-2">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and workflows</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/contacts">
                <Button className="w-full" variant="outline" data-testid="button-view-contacts">
                  <Users className="h-4 w-4 mr-2" />
                  View All Contacts
                </Button>
              </Link>
              <Link href="/campaigns">
                <Button className="w-full" variant="outline" data-testid="button-view-campaigns">
                  <PhoneCall className="h-4 w-4 mr-2" />
                  Manage Campaigns
                </Button>
              </Link>
              <Link href="/analytics">
                <Button className="w-full" variant="outline" data-testid="button-view-analytics">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Analytics
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Recent Calls</CardTitle>
              <CardDescription>Latest call activity</CardDescription>
            </CardHeader>
            <CardContent>
              {recentCalls.length > 0 ? (
                <div className="space-y-3">
                  {recentCalls.map((call) => (
                    <div 
                      key={call.id} 
                      className="flex items-center justify-between py-2 border-b last:border-0"
                      data-testid={`recent-call-${call.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Contact ID: {call.contactId.slice(0, 8)}...</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(call.calledAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className={`text-xs px-2 py-1 rounded-md ${
                        call.status === 'completed' ? 'bg-green-500/10 text-green-600' :
                        call.status === 'missed' ? 'bg-red-500/10 text-red-600' :
                        call.status === 'voicemail' ? 'bg-blue-500/10 text-blue-600' :
                        'bg-yellow-500/10 text-yellow-600'
                      }`}>
                        {call.status}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No recent calls. Start dialing to see activity here.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
