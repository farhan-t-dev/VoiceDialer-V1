import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Mail, Building2, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getInitials, getAvatarColor, formatPhoneNumber, formatDate } from "@/lib/utils";
import type { Contact } from "@shared/schema";

interface ContactTableProps {
  contacts: Contact[];
  isLoading: boolean;
  onSelectContact: (contact: Contact) => void;
  onEditContact: (contact: Contact) => void;
  selectedContactId?: string;
}

export function ContactTable({
  contacts,
  isLoading,
  onSelectContact,
  onEditContact,
  selectedContactId,
}: ContactTableProps) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contact deleted",
        description: "Contact has been removed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete contact.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="rounded-full bg-muted p-6 mb-4">
          <Phone className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2" data-testid="text-no-contacts">No contacts yet</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          Get started by adding your first contact. You'll be able to dial them through Google Voice with one click.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {contacts.map((contact) => (
        <div
          key={contact.id}
          className={`flex items-center gap-4 p-4 hover-elevate cursor-pointer ${
            selectedContactId === contact.id ? "bg-accent" : ""
          }`}
          onClick={() => onSelectContact(contact)}
          data-testid={`contact-row-${contact.id}`}
        >
          <Avatar className="h-12 w-12">
            <AvatarFallback className={`${getAvatarColor(contact.name)} text-white font-semibold`}>
              {getInitials(contact.name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium truncate" data-testid={`text-name-${contact.id}`}>
                {contact.name}
              </h3>
            </div>
            
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Phone className="h-3 w-3" />
                <span className="font-mono" data-testid={`text-phone-${contact.id}`}>
                  {formatPhoneNumber(contact.phone)}
                </span>
              </div>
              
              {contact.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3 w-3" />
                  <span className="truncate" data-testid={`text-email-${contact.id}`}>{contact.email}</span>
                </div>
              )}
              
              {contact.company && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-3 w-3" />
                  <span className="truncate" data-testid={`text-company-${contact.id}`}>{contact.company}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline" data-testid={`text-created-${contact.id}`}>
              {formatDate(contact.createdAt)}
            </span>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" data-testid={`button-menu-${contact.id}`}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditContact(contact);
                  }}
                  data-testid={`button-edit-${contact.id}`}
                >
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(contact.id);
                  }}
                  className="text-destructive"
                  data-testid={`button-delete-${contact.id}`}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
