import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Phone,
  Mail,
  Building2,
  Edit,
  X,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  Voicemail,
  AlertCircle,
} from "lucide-react";
import { getInitials, getAvatarColor, formatPhoneNumber, formatDate, getGoogleVoiceDialUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Contact, CallHistory, InsertCallHistory } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ContactDetailProps {
  contact: Contact;
  onClose: () => void;
  onEdit: () => void;
}

const statusConfig = {
  completed: { icon: CheckCircle2, color: "text-green-500", label: "Completed" },
  missed: { icon: XCircle, color: "text-red-500", label: "Missed" },
  voicemail: { icon: Voicemail, color: "text-blue-500", label: "Voicemail" },
  busy: { icon: AlertCircle, color: "text-orange-500", label: "Busy" },
};

export function ContactDetail({ contact, onClose, onEdit }: ContactDetailProps) {
  const { toast } = useToast();
  const [callNotes, setCallNotes] = useState("");
  const [callStatus, setCallStatus] = useState<InsertCallHistory['status']>("completed");
  const [showCallLog, setShowCallLog] = useState(false);

  const { data: callHistory, isLoading: isLoadingCalls } = useQuery<CallHistory[]>({
    queryKey: ["/api/contacts", contact.id, "calls"],
  });

  const logCallMutation = useMutation({
    mutationFn: async (data: InsertCallHistory) => {
      return apiRequest("POST", "/api/calls", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contact.id, "calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contact.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Call logged",
        description: "Call has been recorded successfully.",
      });
      setCallNotes("");
      setShowCallLog(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to log call.",
        variant: "destructive",
      });
    },
  });

  const handleCall = () => {
    const url = getGoogleVoiceDialUrl(contact.phone);
    window.open(url, "_blank");
    setShowCallLog(true);
  };

  const handleLogCall = () => {
    logCallMutation.mutate({
      contactId: contact.id,
      notes: callNotes || undefined,
      status: callStatus,
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Contact Details</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden" data-testid="button-close-detail">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          <div className="flex flex-col items-center text-center">
            <Avatar className="h-20 w-20 mb-4">
              <AvatarFallback className={`${getAvatarColor(contact.name)} text-white text-xl font-semibold`}>
                {getInitials(contact.name)}
              </AvatarFallback>
            </Avatar>
            <h3 className="text-xl font-semibold mb-1" data-testid="text-detail-name">{contact.name}</h3>
            <p className="text-sm text-muted-foreground font-mono" data-testid="text-detail-phone">
              {formatPhoneNumber(contact.phone)}
            </p>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={handleCall}
              data-testid="button-call"
            >
              <Phone className="h-4 w-4 mr-2" />
              Call via Google Voice
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={onEdit}
              data-testid="button-edit-detail"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Contact
            </Button>
          </div>

          {showCallLog && (
            <div className="p-4 border rounded-md space-y-3 bg-accent/50">
              <h4 className="font-medium text-sm">Log this call</h4>
              
              <Select value={callStatus} onValueChange={(v) => setCallStatus(v as InsertCallHistory['status'])}>
                <SelectTrigger data-testid="select-call-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                </SelectContent>
              </Select>

              <Textarea
                placeholder="Add notes about this call..."
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                rows={3}
                data-testid="input-call-notes"
              />
              
              <div className="flex gap-2">
                <Button
                  onClick={handleLogCall}
                  disabled={logCallMutation.isPending}
                  className="flex-1"
                  data-testid="button-save-call"
                >
                  {logCallMutation.isPending ? "Saving..." : "Save Call"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowCallLog(false)}
                  data-testid="button-cancel-call"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            {contact.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm truncate" data-testid="text-detail-email">{contact.email}</p>
                </div>
              </div>
            )}

            {contact.company && (
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Company</p>
                  <p className="text-sm truncate" data-testid="text-detail-company">{contact.company}</p>
                </div>
              </div>
            )}

            {contact.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm whitespace-pre-wrap" data-testid="text-detail-notes">{contact.notes}</p>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Call History
            </h4>

            {isLoadingCalls ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-md border">
                    <div className="h-5 w-5 mt-0.5 bg-muted animate-pulse rounded" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !callHistory || callHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-calls">
                No calls recorded yet
              </p>
            ) : (
              <div className="space-y-3">
                {callHistory.map((call) => {
                  const StatusIcon = statusConfig[call.status].icon;
                  return (
                    <div
                      key={call.id}
                      className="flex gap-3 p-3 rounded-md border"
                      data-testid={`call-history-${call.id}`}
                    >
                      <StatusIcon className={`h-5 w-5 mt-0.5 ${statusConfig[call.status].color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs" data-testid={`badge-status-${call.id}`}>
                            {statusConfig[call.status].label}
                          </Badge>
                          <span className="text-xs text-muted-foreground" data-testid={`text-call-date-${call.id}`}>
                            {formatDate(call.calledAt)}
                          </span>
                        </div>
                        {call.notes && (
                          <p className="text-sm text-muted-foreground" data-testid={`text-call-notes-${call.id}`}>{call.notes}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
