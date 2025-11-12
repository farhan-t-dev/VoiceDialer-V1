import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Phone, Clock, User, MessageSquare, TrendingUp, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import type { ConversationTranscript, CallInteraction } from "@shared/schema";
import { formatDate } from "@/lib/utils";

interface CallDetailsSheetProps {
  callId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CallDetailsSheet({ callId, open, onOpenChange }: CallDetailsSheetProps) {
  const { data: transcripts, isLoading: isLoadingTranscripts } = useQuery<ConversationTranscript[]>({
    queryKey: ["/api/calls", callId, "transcripts"],
    enabled: !!callId && open,
    queryFn: async () => {
      const response = await fetch(`/api/calls/${callId}/transcripts`);
      if (!response.ok) {
        throw new Error('Failed to fetch transcripts');
      }
      return response.json();
    },
  });

  const { data: interactions, isLoading: isLoadingInteractions } = useQuery<CallInteraction[]>({
    queryKey: ["/api/calls", callId, "interactions"],
    enabled: !!callId && open,
    queryFn: async () => {
      const response = await fetch(`/api/calls/${callId}/interactions`);
      if (!response.ok) {
        throw new Error('Failed to fetch interactions');
      }
      return response.json();
    },
  });

  const getInteractionValue = (field: string): string | null => {
    return interactions?.find(i => i.field === field)?.value || null;
  };

  const getInteractionIcon = (field: string) => {
    const value = getInteractionValue(field);
    if (!value) return null;

    switch(field) {
      case 'interest_level':
        if (value === 'high') return <TrendingUp className="h-4 w-4 text-green-600" />;
        if (value === 'medium') return <TrendingUp className="h-4 w-4 text-yellow-600" />;
        return <TrendingUp className="h-4 w-4 text-muted-foreground" />;
      case 'callback_preference':
        return <Calendar className="h-4 w-4 text-blue-600" />;
      case 'opt_in_status':
        if (value === 'yes') return <CheckCircle2 className="h-4 w-4 text-green-600" />;
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getInterestBadgeVariant = (level: string | null) => {
    if (!level) return "secondary";
    if (level === 'high') return "default";
    if (level === 'medium') return "secondary";
    return "outline";
  };

  const interestLevel = getInteractionValue('interest_level');
  const callbackPreference = getInteractionValue('callback_preference');
  const concerns = getInteractionValue('concerns');
  const optInStatus = getInteractionValue('opt_in_status');
  const notes = getInteractionValue('notes');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl" data-testid="sheet-call-details">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call Details
          </SheetTitle>
          <SheetDescription>
            View conversation transcript and AI-collected insights
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* AI Insights Section */}
          {(interestLevel || callbackPreference || optInStatus || concerns || notes) && (
            <Card data-testid="card-ai-insights">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  AI Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {interestLevel && (
                  <div className="flex items-center justify-between" data-testid="insight-interest-level">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {getInteractionIcon('interest_level')}
                      <span>Interest Level</span>
                    </div>
                    <Badge variant={getInterestBadgeVariant(interestLevel)}>
                      {interestLevel.charAt(0).toUpperCase() + interestLevel.slice(1)}
                    </Badge>
                  </div>
                )}
                {callbackPreference && (
                  <div className="flex items-center justify-between" data-testid="insight-callback">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {getInteractionIcon('callback_preference')}
                      <span>Callback Preference</span>
                    </div>
                    <Badge variant="secondary">{callbackPreference}</Badge>
                  </div>
                )}
                {optInStatus && (
                  <div className="flex items-center justify-between" data-testid="insight-opt-in">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {getInteractionIcon('opt_in_status')}
                      <span>Opt-in Status</span>
                    </div>
                    <Badge variant={optInStatus === 'yes' ? 'default' : 'outline'}>
                      {optInStatus.charAt(0).toUpperCase() + optInStatus.slice(1)}
                    </Badge>
                  </div>
                )}
                {concerns && (
                  <div className="space-y-1" data-testid="insight-concerns">
                    <div className="text-sm text-muted-foreground">Concerns</div>
                    <p className="text-sm">{concerns}</p>
                  </div>
                )}
                {notes && (
                  <div className="space-y-1" data-testid="insight-notes">
                    <div className="text-sm text-muted-foreground">Notes</div>
                    <p className="text-sm">{notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Conversation Transcript Section */}
          <Card data-testid="card-transcript">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Conversation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingTranscripts ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading conversation...</p>
              ) : transcripts && transcripts.length > 0 ? (
                <ScrollArea className="h-96 pr-4">
                  <div className="space-y-4">
                    {transcripts.map((transcript, index) => (
                      <div 
                        key={transcript.id} 
                        className={`flex gap-3 ${transcript.speaker === 'agent' ? 'flex-row' : 'flex-row-reverse'}`}
                        data-testid={`message-${index}`}
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          transcript.speaker === 'agent' 
                            ? 'bg-primary/10 text-primary' 
                            : 'bg-secondary text-secondary-foreground'
                        }`}>
                          {transcript.speaker === 'agent' ? (
                            <MessageSquare className="h-4 w-4" />
                          ) : (
                            <User className="h-4 w-4" />
                          )}
                        </div>
                        <div className={`flex-1 space-y-1 ${transcript.speaker === 'contact' ? 'text-right' : ''}`}>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{transcript.speaker === 'agent' ? 'AI Agent' : 'Caller'}</span>
                            <Clock className="h-3 w-3" />
                            <span>{new Date(transcript.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className={`rounded-lg px-4 py-2 text-sm ${
                            transcript.speaker === 'agent'
                              ? 'bg-primary/10 text-foreground'
                              : 'bg-secondary text-secondary-foreground'
                          }`}>
                            {transcript.message}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No conversation transcript available for this call.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
