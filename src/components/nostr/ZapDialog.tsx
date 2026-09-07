import { useState } from 'react';
import { CheckCircle2, Copy, Loader2, XCircle, Zap } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { useToast } from '@/hooks/useToast';
import { useCreateZapInvoice, useZapReceipts, summarizeZapReceipts, formatSats } from '@/hooks/useZaps';
import { useNwcConnection, usePayWithNwc } from '@/hooks/useNwc';
import { cn } from '@/lib/utils';

const PRESET_AMOUNTS = [21, 100, 500, 1_000, 5_000, 21_000];

type Stage = 'amount' | 'requesting' | 'paying' | 'manual' | 'paid' | 'failed';

interface ZapDialogProps {
  open: boolean;
  onClose: () => void;
  /** The note or reply being zapped. */
  target: NostrEvent;
  /** The recipient's kind-0 event, so a zap endpoint can be resolved. */
  recipientMetadata: NostrEvent | undefined;
  recipientMetadataLoading: boolean;
}

export function ZapDialog({ open, onClose, target, recipientMetadata, recipientMetadataLoading }: ZapDialogProps) {
  const { toast } = useToast();
  const { connection } = useNwcConnection();
  const createInvoice = useCreateZapInvoice();
  const payWithNwc = usePayWithNwc();

  const [stage, setStage] = useState<Stage>('amount');
  const [amount, setAmount] = useState<number | null>(21);
  const [customAmount, setCustomAmount] = useState('');
  const [comment, setComment] = useState('');
  const [invoice, setInvoice] = useState<string | null>(null);
  const [amountSats, setAmountSats] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [receiptBaseline, setReceiptBaseline] = useState(0);

  // Re-fetched on an interval only while this dialog is showing an unpaid
  // manual invoice. Whether that now means "paid" is derived at render time
  // below instead of copied into state, so there is nothing to keep in sync
  // by hand.
  const receipts = useZapReceipts(target.id, { refetchInterval: stage === 'manual' ? 4_000 : false });
  const manualPaymentConfirmed = stage === 'manual' && summarizeZapReceipts(receipts.data).count > receiptBaseline;
  const effectiveStage: Stage = manualPaymentConfirmed ? 'paid' : stage;

  const resolvedAmount = customAmount.trim() ? Number(customAmount) : amount;
  const canSubmit = Boolean(recipientMetadata) && Number.isFinite(resolvedAmount) && (resolvedAmount ?? 0) > 0;

  const handleSubmit = async () => {
    if (!recipientMetadata || !resolvedAmount || resolvedAmount <= 0) return;
    setStage('requesting');
    setErrorMessage('');

    try {
      const { count } = summarizeZapReceipts(receipts.data);
      setReceiptBaseline(count);

      const result = await createInvoice.mutateAsync({
        target,
        recipientMetadata,
        amountSats: resolvedAmount,
        comment: comment.trim() || undefined,
      });
      setInvoice(result.invoice);
      setAmountSats(result.amountSats);

      if (connection) {
        setStage('paying');
        try {
          await payWithNwc.mutateAsync({ connection, invoice: result.invoice });
          setStage('paid');
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : 'Your wallet did not complete the payment.');
          setStage('manual');
        }
      } else {
        setStage('manual');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not request an invoice.');
      setStage('failed');
    }
  };

  const copyInvoice = async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice);
      toast({ title: 'Invoice copied' });
    } catch {
      toast({ title: 'Could not copy the invoice', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-4 text-amber-500" aria-hidden />
            Zap this note
          </DialogTitle>
          <DialogDescription className="sr-only">Send a Lightning zap for this note.</DialogDescription>
        </DialogHeader>

        {effectiveStage === 'amount' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setAmount(preset);
                    setCustomAmount('');
                  }}
                  aria-pressed={amount === preset && !customAmount}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-sm transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    amount === preset && !customAmount
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border hover:bg-muted',
                  )}
                >
                  {formatSats(preset)}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="zap-custom-amount" className="text-xs text-muted-foreground">
                Custom amount (sats)
              </label>
              <Input
                id="zap-custom-amount"
                type="number"
                inputMode="numeric"
                min={1}
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
                placeholder="1000"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="zap-comment" className="text-xs text-muted-foreground">
                Comment (optional)
              </label>
              <Textarea
                id="zap-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Great note!"
                rows={2}
              />
            </div>

            {recipientMetadataLoading ? (
              <p className="text-xs text-muted-foreground">Loading this person's zap settings…</p>
            ) : !recipientMetadata ? (
              <p className="text-xs text-destructive">Could not load this person's profile.</p>
            ) : null}

            <Button className="w-full gap-1.5" onClick={handleSubmit} disabled={!canSubmit}>
              <Zap className="size-4" aria-hidden />
              Zap {resolvedAmount ? `${formatSats(resolvedAmount)} sats` : ''}
            </Button>
          </div>
        )}

        {(effectiveStage === 'requesting' || effectiveStage === 'paying') && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {effectiveStage === 'requesting' ? 'Requesting an invoice…' : 'Waiting for your wallet to pay…'}
            </p>
          </div>
        )}

        {effectiveStage === 'manual' && invoice && (
          <div className="flex flex-col items-center gap-3">
            {errorMessage && (
              <p className="text-center text-xs text-destructive">{errorMessage} Pay the invoice below instead.</p>
            )}
            <div className="rounded-lg border border-border bg-white p-2">
              <QRCodeCanvas value={`lightning:${invoice}`} size={220} />
            </div>
            <p className="text-sm font-medium">{formatSats(amountSats)} sats</p>
            <div className="flex w-full gap-2">
              <Input readOnly value={invoice} className="font-mono text-xs" aria-label="Lightning invoice" />
              <Button type="button" variant="outline" size="icon" onClick={copyInvoice} aria-label="Copy invoice">
                <Copy className="size-4" aria-hidden />
              </Button>
            </div>
            <Button asChild variant="outline" className="w-full">
              <a href={`lightning:${invoice}`}>Open in wallet</a>
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Waiting for payment confirmation…
            </p>
          </div>
        )}

        {effectiveStage === 'paid' && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="size-10 text-emerald-500" aria-hidden />
            <p className="text-sm font-medium">Zap sent!</p>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        )}

        {effectiveStage === 'failed' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <XCircle className="size-10 text-destructive" aria-hidden />
            <p className="text-sm text-destructive">{errorMessage}</p>
            <Button variant="outline" onClick={() => setStage('amount')}>
              Try again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
