import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, FileText, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportResult {
  imported: number;
  failed: number;
  errors: Array<{ lineNumber?: number; data: any; error: string }>;
}

export function CSVImportDialog({ open, onOpenChange }: CSVImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const { toast } = useToast();

  const importMutation = useMutation({
    mutationFn: async (contacts: any[]) => {
      const response = await apiRequest("POST", "/api/contacts/bulk", { contacts });
      return await response.json() as ImportResult;
    },
    onSuccess: (data: ImportResult) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      
      if (data.imported > 0) {
        toast({
          title: "Import Successful",
          description: `${data.imported} contact${data.imported > 1 ? 's' : ''} imported successfully${data.failed > 0 ? `, ${data.failed} failed` : ''}`,
        });
      }
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: "Failed to import contacts. Please check your CSV format.",
      });
    },
  });

  const parseCSV = (text: string): any[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const contacts = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = lines[i].split(',').map(v => v.trim());
      const contact: any = {
        _csvLineNumber: i + 1,
      };

      headers.forEach((header, index) => {
        if (values[index]) {
          contact[header] = values[index];
        }
      });

      contacts.push(contact);
    }

    return contacts;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        toast({
          variant: "destructive",
          title: "Invalid File",
          description: "Please select a CSV file",
        });
        return;
      }
      setFile(selectedFile);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    const text = await file.text();
    const contacts = parseCSV(text);

    if (contacts.length === 0) {
      toast({
        variant: "destructive",
        title: "No Data Found",
        description: "The CSV file appears to be empty or only contains headers.",
      });
      return;
    }

    importMutation.mutate(contacts);
  };

  const handleClose = () => {
    setFile(null);
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-csv-import">
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with columns: name, phone, email, company, notes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!importResult ? (
            <>
              <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-md p-8 hover-elevate">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="csv-upload"
                  data-testid="input-csv-file"
                />
                <label
                  htmlFor="csv-upload"
                  className="flex flex-col items-center cursor-pointer w-full"
                >
                  {file ? (
                    <>
                      <FileText className="h-12 w-12 text-primary mb-2" />
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Click to change file
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-12 w-12 text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">Choose a CSV file</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        or drag and drop
                      </p>
                    </>
                  )}
                </label>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  CSV Format: First row should be headers (name, phone, email, company, notes). 
                  Name and phone are required.
                </AlertDescription>
              </Alert>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  data-testid="button-cancel-import"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!file || importMutation.isPending}
                  data-testid="button-start-import"
                >
                  {importMutation.isPending ? "Importing..." : "Import"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-md bg-success/10">
                  <CheckCircle className="h-5 w-5 text-success" />
                  <div>
                    <p className="text-sm font-medium" data-testid="text-imported-count">
                      {importResult.imported} contact{importResult.imported !== 1 ? 's' : ''} imported successfully
                    </p>
                  </div>
                </div>

                {importResult.failed > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10">
                    <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-2" data-testid="text-failed-count">
                        {importResult.failed} contact{importResult.failed !== 1 ? 's' : ''} failed to import
                      </p>
                      <ScrollArea className="h-32 w-full rounded-md border p-2">
                        {importResult.errors.map((err, idx) => (
                          <div key={idx} className="text-xs text-muted-foreground mb-1">
                            {err.lineNumber ? `Line ${err.lineNumber}` : `Row ${idx + 2}`}: {err.error}
                          </div>
                        ))}
                      </ScrollArea>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button onClick={handleClose} data-testid="button-close-results">
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
