import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Phone, Upload, Tag as TagIcon, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { ContactTable } from "@/components/contact-table";
import { ContactDialog } from "@/components/contact-dialog";
import { ContactDetail } from "@/components/contact-detail";
import { CSVImportDialog } from "@/components/csv-import-dialog";
import { TagManagerDialog } from "@/components/tag-manager-dialog";
import type { Contact } from "@shared/schema";
import { Link } from "wouter";

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);

  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  useEffect(() => {
    if (selectedContact && contacts) {
      const updated = contacts.find(c => c.id === selectedContact.id);
      if (updated) {
        setSelectedContact(updated);
      }
    }
  }, [contacts, selectedContact]);

  const filteredContacts = contacts?.filter((contact) => {
    const query = searchQuery.toLowerCase();
    return (
      contact.name.toLowerCase().includes(query) ||
      contact.phone.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query) ||
      contact.company?.toLowerCase().includes(query)
    );
  });

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingContact(null);
    setIsDialogOpen(true);
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b px-6 backdrop-blur supports-[backdrop-filter]:bg-background/95">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <Phone className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Google Voice Dialer</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-80 pl-9"
              data-testid="input-search"
            />
          </div>
          
          <Link href="/analytics">
            <Button variant="outline" data-testid="button-analytics">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </Button>
          </Link>

          <Button 
            variant="outline" 
            onClick={() => setIsTagManagerOpen(true)} 
            data-testid="button-manage-tags"
          >
            <TagIcon className="h-4 w-4 mr-2" />
            Tags
          </Button>

          <Button 
            variant="outline" 
            onClick={() => setIsImportDialogOpen(true)} 
            data-testid="button-import-csv"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>

          <Button onClick={handleAddNew} data-testid="button-add-contact">
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
          
          <ThemeToggle />
        </div>
      </header>

      <div className="md:hidden px-6 pt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-mobile"
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selectedContact ? 'hidden lg:block' : ''}`}>
          <ContactTable
            contacts={filteredContacts || []}
            isLoading={isLoading}
            onSelectContact={setSelectedContact}
            onEditContact={handleEdit}
            selectedContactId={selectedContact?.id}
          />
        </div>

        {selectedContact && (
          <div className="w-full lg:w-96 border-l overflow-auto">
            <ContactDetail
              contact={selectedContact}
              onClose={() => setSelectedContact(null)}
              onEdit={() => handleEdit(selectedContact)}
            />
          </div>
        )}
      </div>

      <ContactDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        contact={editingContact}
      />

      <CSVImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
      />

      <TagManagerDialog
        open={isTagManagerOpen}
        onOpenChange={setIsTagManagerOpen}
      />
    </div>
  );
}
