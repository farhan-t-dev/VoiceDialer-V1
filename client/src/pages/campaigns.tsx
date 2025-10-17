import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Phone, ArrowLeft, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCampaignSchema, type Campaign } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const formSchema = insertCampaignSchema.extend({
  name: z.string().min(1, "Campaign name is required"),
  description: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

function CampaignCard({ campaign, onSelect }: { campaign: Campaign; onSelect: (id: string) => void }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Campaign deleted",
        description: "The campaign has been removed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete campaign.",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this campaign?")) {
      deleteMutation.mutate(campaign.id);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      draft: { variant: "outline" as const, color: "text-muted-foreground" },
      active: { variant: "default" as const, color: "text-primary-foreground" },
      completed: { variant: "secondary" as const, color: "" },
      paused: { variant: "outline" as const, color: "text-warning" },
    };
    
    const config = variants[status as keyof typeof variants] || variants.draft;
    
    return (
      <Badge variant={config.variant} className={config.color} data-testid={`badge-status-${campaign.id}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <Card 
      className="hover-elevate active-elevate-2 cursor-pointer" 
      onClick={() => setLocation(`/campaigns/${campaign.id}`)}
      data-testid={`card-campaign-${campaign.id}`}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-lg truncate" data-testid={`text-campaign-name-${campaign.id}`}>
            {campaign.name}
          </CardTitle>
          {campaign.description && (
            <CardDescription className="mt-1 line-clamp-2" data-testid={`text-campaign-desc-${campaign.id}`}>
              {campaign.description}
            </CardDescription>
          )}
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(campaign.status)}
          <Button 
            size="icon" 
            variant="ghost" 
            onClick={handleDelete}
            data-testid={`button-delete-${campaign.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground" data-testid={`text-created-${campaign.id}`}>
          Created {new Date(campaign.createdAt).toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  );
}

function CreateCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "draft",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return await apiRequest("POST", "/api/campaigns", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Campaign created",
        description: "Your new campaign has been created successfully.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create campaign.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-create-campaign">
        <DialogHeader>
          <DialogTitle>Create New Campaign</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Q1 2024 Outreach"
                      {...field}
                      data-testid="input-campaign-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe your campaign goals..."
                      {...field}
                      data-testid="input-campaign-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-campaign">
                {createMutation.isPending ? "Creating..." : "Create Campaign"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function CampaignsPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b px-6 backdrop-blur supports-[backdrop-filter]:bg-background/95">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <Phone className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Campaigns</h1>
            <p className="text-xs text-muted-foreground">Manage bulk calling campaigns</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-campaign">
            <Plus className="h-4 w-4 mr-2" />
            Create Campaign
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading campaigns...</p>
          </div>
        ) : campaigns && campaigns.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onSelect={(id) => console.log("Selected", id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-muted-foreground">No campaigns yet. Create your first campaign to get started.</p>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-campaign">
              <Plus className="h-4 w-4 mr-2" />
              Create Campaign
            </Button>
          </div>
        )}
      </main>

      <CreateCampaignDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
    </div>
  );
}
