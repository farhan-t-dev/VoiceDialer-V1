import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, CheckCircle2, TrendingUp, Users, BarChart3, Eye } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CallDetailsSheet } from "@/components/call-details-sheet";
import type { CallHistory, Contact } from "@shared/schema";
import { formatDate } from "@/lib/utils";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface CallStats {
  totalCalls: number;
  completedCalls: number;
  successRate: number;
  activeContacts: number;
  callsByStatus: { status: string; count: number; percentage: number }[];
  callsByDate: { date: string; count: number }[];
  topContacts: { contact: Contact; callCount: number }[];
}

const STATUS_COLORS = {
  completed: "#10b981",
  missed: "#ef4444",
  voicemail: "#3b82f6",
  busy: "#f59e0b",
};

const STATUS_LABELS = {
  completed: "Completed",
  missed: "Missed",
  voicemail: "Voicemail",
  busy: "Busy",
};

export default function Analytics() {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [isDetailsSheetOpen, setIsDetailsSheetOpen] = useState(false);

  const { data: allCalls, isLoading: isLoadingCalls } = useQuery<CallHistory[]>({
    queryKey: ["/api/calls"],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const handleViewDetails = (callId: string) => {
    setSelectedCallId(callId);
    setIsDetailsSheetOpen(true);
  };

  const stats: CallStats = {
    totalCalls: 0,
    completedCalls: 0,
    successRate: 0,
    activeContacts: 0,
    callsByStatus: [],
    callsByDate: [],
    topContacts: [],
  };

  if (allCalls && contacts) {
    stats.totalCalls = allCalls.length;
    stats.completedCalls = allCalls.filter((c) => c.status === "completed").length;
    stats.successRate = stats.totalCalls > 0 ? (stats.completedCalls / stats.totalCalls) * 100 : 0;

    const statusCounts: Record<string, number> = {
      completed: 0,
      missed: 0,
      voicemail: 0,
      busy: 0,
    };

    allCalls.forEach((call) => {
      statusCounts[call.status] = (statusCounts[call.status] || 0) + 1;
    });

    stats.callsByStatus = Object.entries(statusCounts)
      .map(([status, count]) => ({
        status: STATUS_LABELS[status as keyof typeof STATUS_LABELS],
        count,
        percentage: stats.totalCalls > 0 ? (count / stats.totalCalls) * 100 : 0,
      }))
      .filter((s) => s.count > 0);

    const dateMap = new Map<string, number>();
    allCalls.forEach((call) => {
      const date = new Date(call.calledAt).toLocaleDateString();
      dateMap.set(date, (dateMap.get(date) || 0) + 1);
    });

    stats.callsByDate = Array.from(dateMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-14);

    const contactCallCounts = new Map<string, number>();
    allCalls.forEach((call) => {
      contactCallCounts.set(call.contactId, (contactCallCounts.get(call.contactId) || 0) + 1);
    });

    stats.activeContacts = contactCallCounts.size;

    stats.topContacts = Array.from(contactCallCounts.entries())
      .map(([contactId, callCount]) => ({
        contact: contacts.find((c) => c.id === contactId)!,
        callCount,
      }))
      .filter((tc) => tc.contact)
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 5);
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b px-4 sm:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/95">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border-2 border-primary/20">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div className="hidden sm:block min-w-0">
            <h1 className="text-lg font-semibold truncate">Analytics</h1>
            <p className="text-xs text-muted-foreground truncate">Track calling performance</p>
          </div>
        </div>
        
        <ThemeToggle />
      </header>

      <main className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoadingCalls ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading analytics...</p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto space-y-6">

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-calls">
                {stats.totalCalls}
              </div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Calls</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-completed-calls">
                {stats.completedCalls}
              </div>
              <p className="text-xs text-muted-foreground">Successful connections</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-success-rate">
                {stats.successRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">Completion percentage</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Contacts</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-active-contacts">
                {stats.activeContacts}
              </div>
              <p className="text-xs text-muted-foreground">With call history</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Call Volume Over Time</CardTitle>
              <CardDescription>Last 14 days of calling activity</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.callsByDate.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={stats.callsByDate}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No call data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Call Status Distribution</CardTitle>
              <CardDescription>Breakdown by call outcome</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.callsByStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={stats.callsByStatus}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ status, percentage }) => `${status} (${percentage.toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {stats.callsByStatus.map((entry) => {
                        const statusKey = Object.keys(STATUS_LABELS).find(
                          (k) => STATUS_LABELS[k as keyof typeof STATUS_LABELS] === entry.status
                        );
                        return (
                          <Cell
                            key={`cell-${entry.status}`}
                            fill={STATUS_COLORS[statusKey as keyof typeof STATUS_COLORS]}
                          />
                        );
                      })}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No call data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Top Contacts by Call Volume</CardTitle>
            <CardDescription>Your most frequently called contacts</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topContacts.length > 0 ? (
              <div className="space-y-4">
                {stats.topContacts.map((tc, index) => (
                  <div key={tc.contact.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="w-8 h-8 flex items-center justify-center">
                        {index + 1}
                      </Badge>
                      <div>
                        <p className="font-medium" data-testid={`top-contact-name-${index}`}>
                          {tc.contact.name}
                        </p>
                        <p className="text-sm text-muted-foreground">{tc.contact.phone}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold" data-testid={`top-contact-calls-${index}`}>
                        {tc.callCount} calls
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No call history available yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Call History</CardTitle>
            <CardDescription>All calls with conversation details</CardDescription>
          </CardHeader>
          <CardContent>
            {allCalls && allCalls.length > 0 ? (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allCalls.map((call) => {
                      const contact = contacts?.find(c => c.id === call.contactId);
                      return (
                        <TableRow key={call.id} data-testid={`row-call-${call.id}`}>
                          <TableCell className="font-medium">
                            {contact?.name || 'Unknown'}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {contact?.phone || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={call.status === 'completed' ? 'default' : 'secondary'}
                              data-testid={`badge-status-${call.id}`}
                            >
                              {call.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(call.calledAt)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                            {call.notes || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleViewDetails(call.id)}
                              data-testid={`button-view-details-${call.id}`}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No call history available yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        )}
      </main>

      <CallDetailsSheet 
        callId={selectedCallId}
        open={isDetailsSheetOpen}
        onOpenChange={setIsDetailsSheetOpen}
      />
    </div>
  );
}
