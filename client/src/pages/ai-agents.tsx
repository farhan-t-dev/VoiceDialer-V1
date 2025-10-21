import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit2, Trash2, Bot, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAiAgentSchema, type AiAgent, type InsertAiAgent } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function AiAgents() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AiAgent | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const { data: agents, isLoading } = useQuery<AiAgent[]>({
    queryKey: ["/api/agents"],
  });

  const form = useForm<InsertAiAgent>({
    resolver: zodResolver(insertAiAgentSchema),
    defaultValues: {
      name: "",
      personality: "",
      voiceId: "",
      conversationScript: "",
      greeting: "",
      objectionHandling: "",
      closingScript: "",
      isActive: "true",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertAiAgent) => {
      return await apiRequest("POST", "/api/agents", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "AI Agent created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create AI agent", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertAiAgent> }) => {
      return await apiRequest("PATCH", `/api/agents/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setDialogOpen(false);
      setEditingAgent(null);
      form.reset();
      toast({ title: "AI Agent updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update AI agent", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/agents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "AI Agent deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete AI agent", variant: "destructive" });
    },
  });

  const handleEdit = (agent: AiAgent) => {
    setEditingAgent(agent);
    form.reset({
      name: agent.name,
      personality: agent.personality,
      voiceId: agent.voiceId || "",
      conversationScript: agent.conversationScript,
      greeting: agent.greeting || "",
      objectionHandling: agent.objectionHandling || "",
      closingScript: agent.closingScript || "",
      isActive: agent.isActive as 'true' | 'false',
    });
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this AI agent?")) {
      deleteMutation.mutate(id);
    }
  };

  const onSubmit = (data: InsertAiAgent) => {
    if (editingAgent) {
      updateMutation.mutate({ id: editingAgent.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const toggleExpand = (agentId: string) => {
    const newExpanded = new Set(expandedAgents);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
    } else {
      newExpanded.add(agentId);
    }
    setExpandedAgents(newExpanded);
  };

  const activeAgents = agents?.filter(a => a.isActive === 'true').length || 0;

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
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div className="hidden sm:block min-w-0">
            <h1 className="text-lg font-semibold truncate">AI Agents</h1>
            <p className="text-xs text-muted-foreground truncate">{activeAgents} active agents</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingAgent(null);
              form.reset();
            }
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-agent">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Create Agent</span>
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingAgent ? "Edit AI Agent" : "Create AI Agent"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Agent Name*</FormLabel>
                        <FormControl>
                          <Input placeholder="Sales Agent Pro" {...field} data-testid="input-agent-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="voiceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ElevenLabs Voice ID</FormLabel>
                        <FormControl>
                          <Input placeholder="21m00Tcm4TlvDq8ikWAM" {...field} value={field.value || ""} data-testid="input-voice-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="personality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Personality Description*</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Friendly, professional, empathetic sales representative with 10 years of experience..."
                          {...field}
                          data-testid="input-personality"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="conversationScript"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Conversation Script/Prompt*</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="You are a sales agent calling to discuss our premium services..."
                          rows={4}
                          {...field}
                          data-testid="input-script"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="greeting"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Opening Greeting</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Hi, this is [Agent Name] calling from [Company]..."
                          {...field}
                          value={field.value || ""}
                          data-testid="input-greeting"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="objectionHandling"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Objection Handling</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="When customer says they're not interested: 'I understand, but let me share...'"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-objection"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="closingScript"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Closing Script</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Thank you for your time. Can I schedule a follow-up call?"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-closing"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <FormLabel>Active Agent</FormLabel>
                        <p className="text-sm text-muted-foreground">Enable this agent for campaigns</p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value === 'true'}
                          onCheckedChange={(checked) => field.onChange(checked ? 'true' : 'false')}
                          data-testid="switch-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex flex-col sm:flex-row justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-agent" className="w-full sm:w-auto">
                    {editingAgent ? "Update Agent" : "Create Agent"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        <ThemeToggle />
      </div>
      </header>

      <main className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading AI agents...</p>
          </div>
        ) : !agents || agents.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No AI Agents Yet</h3>
            <p className="text-muted-foreground mb-4">Create your first AI agent to automate conversations</p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-create-first-agent">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Agent
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {agents.map((agent) => (
              <Card key={agent.id} data-testid={`card-agent-${agent.id}`}>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <CardTitle className="text-lg">{agent.name}</CardTitle>
                        <Badge variant={agent.isActive === 'true' ? 'default' : 'secondary'}>
                          {agent.isActive === 'true' ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2">{agent.personality.substring(0, 100)}...</CardDescription>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEdit(agent)}
                        data-testid={`button-edit-${agent.id}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDelete(agent.id)}
                        data-testid={`button-delete-${agent.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <Collapsible open={expandedAgents.has(agent.id)} onOpenChange={() => toggleExpand(agent.id)}>
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-between px-6"
                      data-testid={`button-expand-${agent.id}`}
                    >
                      <span>View Full Configuration</span>
                      {expandedAgents.has(agent.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="space-y-4 pt-4">
                      {agent.voiceId && (
                        <div>
                          <h4 className="font-semibold text-sm mb-1">ElevenLabs Voice ID</h4>
                          <p className="text-sm text-muted-foreground">{agent.voiceId}</p>
                        </div>
                      )}
                      
                      <div>
                        <h4 className="font-semibold text-sm mb-1">Conversation Script</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{agent.conversationScript}</p>
                      </div>

                      {agent.greeting && (
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Opening Greeting</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{agent.greeting}</p>
                        </div>
                      )}

                      {agent.objectionHandling && (
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Objection Handling</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{agent.objectionHandling}</p>
                        </div>
                      )}

                      {agent.closingScript && (
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Closing Script</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{agent.closingScript}</p>
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
