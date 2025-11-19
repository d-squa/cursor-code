import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ClientForm from "./ClientForm";

interface Client {
  id: string;
  name: string;
  industry: string;
  business_objective: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientSelected: (clientId: string) => void;
  userId: string;
}

export default function ClientSelectionDialog({ open, onOpenChange, onClientSelected, userId }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && userId) {
      loadClients();
    }
  }, [open, userId]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, industry, business_objective")
        .eq("user_id", userId)
        .order("name");

      if (error) throw error;
      setClients(data || []);
    } catch (error: any) {
      console.error("Error loading clients:", error);
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async (data: any) => {
    try {
      const { data: newClient, error } = await supabase
        .from("clients")
        .insert({
          user_id: userId,
          ...data,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Client created successfully");
      setClients([...clients, newClient]);
      setSelectedClientId(newClient.id);
      setShowNewClientForm(false);
    } catch (error: any) {
      console.error("Error creating client:", error);
      toast.error("Failed to create client");
      throw error;
    }
  };

  const handleConfirm = () => {
    if (selectedClientId) {
      onClientSelected(selectedClientId);
      onOpenChange(false);
    } else {
      toast.error("Please select a client");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Client</DialogTitle>
          <DialogDescription>
            Choose a client to associate with this ad account
          </DialogDescription>
        </DialogHeader>

        {showNewClientForm ? (
          <div>
            <ClientForm
              onSubmit={handleCreateClient}
              onCancel={() => setShowNewClientForm(false)}
              submitLabel="Create Client"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name} - {client.industry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setShowNewClientForm(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Client
            </Button>

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={!selectedClientId}>
                Confirm
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
