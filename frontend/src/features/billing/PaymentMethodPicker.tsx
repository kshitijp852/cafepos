import { CreditCard, DeviceMobile, Money, type Icon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";

const OPTIONS: { value: PaymentMethod; label: string; icon: Icon; hint: string }[] = [
  { value: "cash", label: "Cash", icon: Money, hint: "Pay at counter" },
  { value: "card", label: "Card", icon: CreditCard, hint: "Credit / debit" },
  { value: "upi", label: "UPI", icon: DeviceMobile, hint: "UPI / wallet" },
];

interface Props {
  value: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
}

export function PaymentMethodPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex flex-col items-center gap-1.5 border p-3 text-center transition-colors",
              active
                ? "border-foreground bg-primary text-primary-foreground"
                : "border-border hover:border-foreground",
            )}
          >
            <Icon size={22} weight={active ? "fill" : "regular"} />
            <span className="text-sm font-medium">{opt.label}</span>
            <span className={cn("text-[0.65rem]", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
              {opt.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
