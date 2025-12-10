import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, Download, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  invoice_pdf: string | null;
}

interface BillingData {
  paymentMethods: PaymentMethod[];
  invoices: Invoice[];
  balance: number;
  nextPaymentDate: string | null;
}

export default function BillingManagement() {
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingData, setBillingData] = useState<BillingData>({
    paymentMethods: [],
    invoices: [],
    balance: 0,
    nextPaymentDate: null,
  });

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke("get-billing-info", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (data) {
        setBillingData(data);
      }
    } catch (error) {
      console.error("Error fetching billing data:", error);
      // Silently fail - will show empty state
    } finally {
      setLoading(false);
    }
  };

  const handleManagePaymentMethods = async () => {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in");
        return;
      }

      const { data, error } = await supabase.functions.invoke("customer-portal", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      console.error("Portal error:", error);
      toast.error(error.message || "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleDownloadInvoice = (invoiceUrl: string | null) => {
    if (invoiceUrl) {
      window.open(invoiceUrl, "_blank");
    } else {
      toast.error("Invoice PDF not available");
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Billing Management</h2>
        <p className="text-muted-foreground mt-2">
          Manage your payment methods and billing history
        </p>
      </div>

      {/* Current Balance */}
      <Card>
        <CardHeader>
          <CardTitle>Current Balance</CardTitle>
          <CardDescription>Your account balance and next payment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Balance Due</p>
              <p className="text-3xl font-bold">
                {formatCurrency(billingData.balance, "usd")}
              </p>
            </div>
            {billingData.nextPaymentDate && (
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Next Payment</p>
                <p className="text-lg font-semibold">
                  {formatDate(billingData.nextPaymentDate)}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Methods */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Payment Methods</CardTitle>
            <CardDescription>Manage your saved payment methods</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleManagePaymentMethods}
            disabled={portalLoading}
          >
            {portalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <ExternalLink className="h-4 w-4 mr-2" />
            Manage in Stripe
          </Button>
        </CardHeader>
        <CardContent>
          {billingData.paymentMethods.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No payment methods on file</p>
              <p className="text-sm mt-2">Add a payment method via the Stripe portal</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={handleManagePaymentMethods}
                disabled={portalLoading}
              >
                {portalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Payment Method
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {billingData.paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <CreditCard className="h-6 w-6 text-muted-foreground" />
                    <div>
                      <p className="font-medium capitalize">
                        {method.brand} ending in {method.last4}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Expires {method.exp_month}/{method.exp_year}
                      </p>
                    </div>
                    {method.is_default && (
                      <Badge variant="secondary">Default</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>View and download your past invoices</CardDescription>
        </CardHeader>
        <CardContent>
          {billingData.invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No billing history yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {billingData.invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{formatDate(invoice.date)}</TableCell>
                    <TableCell>{invoice.description}</TableCell>
                    <TableCell>{formatCurrency(invoice.amount, invoice.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === "paid" ? "default" : "secondary"}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadInvoice(invoice.invoice_pdf)}
                        disabled={!invoice.invoice_pdf}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}