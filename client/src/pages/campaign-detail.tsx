import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Play, Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import type { Campaign, Contact, CampaignContact } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

  const { data: campaign } = useQuery<Campaign>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !!campaignId,
  });

  const { data: campaignContacts, isLoading } = useQuery<(CampaignContact & { contact: Contact })[]>({
    queryKey: ["/api/campaigns", campaignId, "contacts"],
    enabled: !!campaignId,
  });

  const startCampaignMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/campaigns/${campaignId}/dial`, {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
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

  const handleStartCampaign = () => {
    if (window.confirm("Are you sure you want to start dialing all contacts in this campaign?")) {
      startCampaignMutation.mutate();
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

  if (!campaign) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading campaign...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b px-6 backdrop-blur supports-[backdrop-filter]:bg-background/95">
        <div className="flex items-center gap-3">
          <Link href="/campaigns">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-campaign-name">{campaign.name}</h1>
            <p className="text-xs text-muted-foreground">{campaign.description || "No description"}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {campaign.status !== 'active' && pendingCount > 0 && (
            <Button 
              onClick={handleStartCampaign}
              disabled={startCampaignMutation.isPending}
              data-testid="button-start-campaign"
            >
              {startCampaignMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Campaign
                </>
              )}
            </Button>
          )}
          <Button 
            variant="outline" 
            onClick={() => setIsAddContactsDialogOpen(true)}
            data-testid="button-add-contacts"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Contacts
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize" data-testid="text-status">
                {campaign.status}
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
    </div>
  );
}
