import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Play, Plus, X, Loader2, Phone, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Campaign, Contact, CampaignContact } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Link, useRoute } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function AddContactsDialog({ 
  campaignId, 
  open, 
  onOpenChange 
}: { 
  campaignId: string; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  const { data: allContacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: campaignContacts } = useQuery<(CampaignContact & { contact: Contact })[]>({
    queryKey: ["/api/campaigns", campaignId, "contacts"],
  });

  const existingContactIds = campaignContacts?.map(cc => cc.contactId) || [];
  const availableContacts = allContacts?.filter(c => !existingContactIds.includes(c.id)) || [];

  const addContactsMutation = useMutation({
    mutationFn: async (contactIds: string[]) => {
      await apiRequest("POST", `/api/campaigns/${campaignId}/contacts`, { contactIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "contacts"] });
      toast({
        title: "Contacts added",
        description: `${selectedContactIds.length} contact(s) added to campaign.`,
      });
      setSelectedContactIds([]);
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add contacts to campaign.",
        variant: "destructive",
      });
    },
  });

  const handleToggleContact = (contactId: string) => {
    setSelectedContactIds(prev => 
      prev.includes(contactId) 
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleSelectAll = () => {
    if (selectedContactIds.length === availableContacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(availableContacts.map(c => c.id));
    }
  };

  const handleSubmit = () => {
    if (selectedContactIds.length > 0) {
      addContactsMutation.mutate(selectedContactIds);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-add-contacts">
        <DialogHeader>
          <DialogTitle>Add Contacts to Campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {availableContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              All contacts have been added to this campaign.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSelectAll}
                  data-testid="button-select-all"
                >
                  {selectedContactIds.length === availableContacts.length ? "Deselect All" : "Select All"}
                </Button>
                <p className="text-sm text-muted-foreground">
                  {selectedContactIds.length} selected
                </p>
              </div>
              <div className="border rounded-md max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Company</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableContacts.map((contact) => (
                      <TableRow 
                        key={contact.id} 
                        className="cursor-pointer hover-elevate"
                        onClick={() => handleToggleContact(contact.id)}
                        data-testid={`row-contact-${contact.id}`}
                      >
                        <TableCell>
                          <Checkbox 
                            checked={selectedContactIds.includes(contact.id)}
                            onCheckedChange={() => handleToggleContact(contact.id)}
                            data-testid={`checkbox-contact-${contact.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{contact.name}</TableCell>
                        <TableCell className="font-mono text-sm">{contact.phone}</TableCell>
                        <TableCell className="text-muted-foreground">{contact.company || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button 
            onClick={handleSubmit}
            disabled={selectedContactIds.length === 0 || addContactsMutation.isPending}
            data-testid="button-confirm-add-contacts"
          >
            {addContactsMutation.isPending ? "Adding..." : `Add ${selectedContactIds.length} Contact(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CampaignDetailPage() {
  const [, params] = useRoute("/campaigns/:id");
  const campaignId = params?.id || "";
  const { toast } = useToast();
  const [isAddContactsDialogOpen, setIsAddContactsDialogOpen] = useState(false);
  const [isRestartDialogOpen, setIsRestartDialogOpen] = useState(false);
  const previousStatusRef = useRef<string | null>(null);

  const { data: campaign } = useQuery<Campaign>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !!campaignId,
    refetchOnMount: false, // Don't refetch on every mount
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchInterval: (query) => {
      // Poll every 20 seconds as fallback when campaign is active
      // This ensures login notifications appear even if WebSocket fails
      const data = query.state.data as Campaign | undefined;
      const isActiveCampaign = data?.status === 'active' || data?.status === 'waiting_for_login';
      
      if (!isActiveCampaign) return false;
      
      return 20000; // 20 seconds - matches backend login check interval
    },
  });

  // Show notification when login is required
  useEffect(() => {
    if (campaign && campaign.status === 'waiting_for_login' && previousStatusRef.current !== 'waiting_for_login') {
      toast({
        title: "Manual Login Required",
        description: "Please log in to Google Voice in the browser window to continue the campaign.",
        duration: 10000,
      });
    }
    previousStatusRef.current = campaign?.status || null;
  }, [campaign?.status, toast]);

  const { data: campaignContacts, isLoading } = useQuery<(CampaignContact & { contact: Contact })[]>({
    queryKey: ["/api/campaigns", campaignId, "contacts"],
    enabled: !!campaignId,
    refetchOnMount: false, // Don't refetch on every mount
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchInterval: (query) => {
      // Poll every 20 seconds as fallback when campaign is active
      // This ensures UI updates even if WebSocket fails
      const isActiveCampaign = campaign?.status === 'active' || campaign?.status === 'waiting_for_login';
      
      if (!isActiveCampaign) return false;
      
      return 20000; // 20 seconds - matches backend login check interval
    },
  });

  const startCampaignMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/campaigns/${campaignId}/dial`, {});
    },
    onSuccess: (data: any) => {
      // Only invalidate contacts query - campaign status will be updated by WebSocket
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "contacts"] });
      toast({
        title: "Campaign started",
        description: data.message || "Campaign dialing has begun.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start campaign dialing.",
        variant: "destructive",
      });
    },
  });

  const resetCampaignMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/campaigns/${campaignId}/reset`, {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "contacts"] });
      toast({
        title: "Campaign reset",
        description: `${data.contactsReset} contact(s) reset to pending.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reset campaign.",
        variant: "destructive",
      });
    },
  });

  const handleStartCampaign = () => {
    if (window.confirm("Are you sure you want to start dialing all contacts in this campaign?")) {
      startCampaignMutation.mutate();
    }
  };

  const handleRestartCampaign = () => {
    resetCampaignMutation.mutate();
  };

  const stopCampaignMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/campaigns/${campaignId}/stop`, {});
    },
    onSuccess: () => {
      // Only invalidate contacts query - campaign status will be updated by WebSocket
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "contacts"] });
      toast({
        title: "Campaign stopped",
        description: "Campaign has been stopped successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to stop campaign.",
        variant: "destructive",
      });
    },
  });

  const handleStopCampaign = () => {
    if (window.confirm("Are you sure you want to stop this campaign?")) {
      stopCampaignMutation.mutate();
    }
  };

  const getStatusBadge = (status: string) => {
    const config = {
      pending: { variant: "outline" as const, text: "Pending" },
      calling: { variant: "default" as const, text: "Calling..." },
      completed: { variant: "secondary" as const, text: "Completed" },
      failed: { variant: "destructive" as const, text: "Failed" },
    };
    
    const statusConfig = config[status as keyof typeof config] || config.pending;
    
    return (
      <Badge variant={statusConfig.variant}>
        {statusConfig.text}
      </Badge>
    );
  };

  const pendingCount = campaignContacts?.filter(cc => cc.status === 'pending').length || 0;
  const completedCount = campaignContacts?.filter(cc => cc.status === 'completed').length || 0;
  const failedCount = campaignContacts?.filter(cc => cc.status === 'failed').length || 0;
  const totalContacts = campaignContacts?.length || 0;
  
  // Show restart button if there are contacts that can be dialed (pending or failed)
  const hasRetryableContacts = pendingCount > 0 || failedCount > 0;
  
  // For fully completed campaigns, show restart button to re-dial all contacts
  const isFullyCompleted = campaign?.status === 'completed' && completedCount === totalContacts && totalContacts > 0;

  if (!campaign) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading campaign...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b px-4 sm:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/95">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Link href="/campaigns">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border-2 border-primary/20 shrink-0">
            <Phone className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-semibold truncate" data-testid="text-campaign-name">{campaign.name}</h1>
            <p className="text-xs text-muted-foreground truncate hidden sm:block">{campaign.description || "No description"}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Show Start button for draft campaigns with pending/failed contacts */}
          {campaign.status === 'draft' && hasRetryableContacts && (
            <Button 
              onClick={handleStartCampaign}
              disabled={startCampaignMutation.isPending}
              data-testid="button-start-campaign"
              size="sm"
            >
              {startCampaignMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                  <span className="hidden sm:inline">Starting...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Start Campaign</span>
                </>
              )}
            </Button>
          )}
          {/* Show Restart button for completed/paused/waiting_for_login/failed campaigns with pending/failed contacts */}
          {(campaign.status === 'completed' || campaign.status === 'paused' || campaign.status === 'waiting_for_login' || campaign.status === 'failed') && hasRetryableContacts && (
            <Button 
              onClick={handleStartCampaign}
              disabled={startCampaignMutation.isPending}
              data-testid="button-restart-campaign"
              size="sm"
            >
              {startCampaignMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                  <span className="hidden sm:inline">Restarting...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Restart Campaign</span>
                </>
              )}
            </Button>
          )}
          {/* Show Restart button for fully completed campaigns to re-dial all contacts */}
          {isFullyCompleted && (
            <Button 
              onClick={() => setIsRestartDialogOpen(true)}
              disabled={resetCampaignMutation.isPending}
              data-testid="button-restart-campaign"
              size="sm"
            >
              {resetCampaignMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                  <span className="hidden sm:inline">Resetting...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Restart Campaign</span>
                </>
              )}
            </Button>
          )}
          {(campaign.status === 'active' || campaign.status === 'waiting_for_login') && (
            <Button 
              onClick={handleStopCampaign}
              disabled={stopCampaignMutation.isPending}
              variant="destructive"
              data-testid="button-stop-campaign"
              size="sm"
            >
              {stopCampaignMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                  <span className="hidden sm:inline">Stopping...</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Stop Campaign</span>
                  <span className="sm:hidden">Stop</span>
                </>
              )}
            </Button>
          )}
          <Button 
            variant="outline" 
            onClick={() => setIsAddContactsDialogOpen(true)}
            data-testid="button-add-contacts"
            size="sm"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Contacts</span>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {campaign.status === 'waiting_for_login' && (
          <Alert variant="destructive" className="border-2 animate-pulse" data-testid="alert-status-message">
            <AlertCircle className="h-5 w-5" />
            <AlertDescription className="ml-2 text-base font-medium">
              MANUAL LOGIN REQUIRED - Please complete Google login in the browser window. The campaign will automatically continue once you log in.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-status">
                {campaign.status === 'waiting_for_login' 
                  ? 'Login Required' 
                  : campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-contacts">
                {campaignContacts?.length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-completed">
                {completedCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600" data-testid="text-pending">
                {pendingCount}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Campaign Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center text-muted-foreground py-8">Loading contacts...</p>
            ) : campaignContacts && campaignContacts.length > 0 ? (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Called At</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignContacts.map((cc) => (
                      <TableRow key={cc.contactId} data-testid={`row-campaign-contact-${cc.contactId}`}>
                        <TableCell className="font-medium" data-testid={`text-name-${cc.contactId}`}>
                          {cc.contact.name}
                        </TableCell>
                        <TableCell className="font-mono text-sm" data-testid={`text-phone-${cc.contactId}`}>
                          {cc.contact.phone}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {cc.contact.company || "—"}
                        </TableCell>
                        <TableCell data-testid={`text-status-${cc.contactId}`}>
                          {getStatusBadge(cc.status)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {cc.calledAt ? new Date(cc.calledAt).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {cc.notes || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No contacts in this campaign yet.</p>
                <Button 
                  onClick={() => setIsAddContactsDialogOpen(true)}
                  data-testid="button-add-first-contact"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contacts
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <AddContactsDialog 
        campaignId={campaignId}
        open={isAddContactsDialogOpen}
        onOpenChange={setIsAddContactsDialogOpen}
      />

      <AlertDialog open={isRestartDialogOpen} onOpenChange={setIsRestartDialogOpen}>
        <AlertDialogContent data-testid="dialog-restart-campaign">
          <AlertDialogHeader>
            <AlertDialogTitle>Restart Campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset all {totalContacts} contact(s) back to pending status. The campaign will return to draft state, allowing you to review and start dialing again when ready.
              <br /><br />
              <strong>All contacts will be re-dialed, including those previously completed.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-restart">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRestartCampaign}
              data-testid="button-confirm-restart"
            >
              Reset Campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <Toaster />
    </div>
  );
}
