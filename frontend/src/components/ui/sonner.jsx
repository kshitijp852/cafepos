import { useTheme } from "next-themes"
import { Toaster as Sonner, toast as sonnerToast } from "sonner"

import { pushNotification } from "@/lib/notifications"

const Toaster = ({
  ...props
}) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast rounded-none group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props} />
  );
}

// Record every toast into the notification log (AlertsBell panel), then show it.
// Only string messages are logged; ReactNode toasts still display normally.
const record = (kind, message) => {
  if (typeof message === "string" && message.trim()) pushNotification(kind, message)
}

const wrap = (kind, fn) => (message, opts) => {
  record(kind, message)
  return fn(message, opts)
}

const toast = Object.assign(wrap("info", sonnerToast), {
  ...sonnerToast,
  success: wrap("success", sonnerToast.success),
  error: wrap("error", sonnerToast.error),
  warning: wrap("warning", sonnerToast.warning),
  info: wrap("info", sonnerToast.info),
  message: wrap("info", sonnerToast.message),
})

export { Toaster, toast }
