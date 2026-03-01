import { Toaster as Sonner, toast } from "sonner";
import type { ComponentProps } from "react";

type ToasterProps = ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-center"
      offset={{ top: 24 }}
      duration={5000}
      closeButton={false}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-2xl group-[.toaster]:border-[hsl(var(--notification-border))] group-[.toaster]:bg-[hsl(var(--notification-surface)/0.96)] group-[.toaster]:text-[hsl(var(--notification-foreground))] group-[.toaster]:shadow-2xl group-[.toaster]:backdrop-blur-xl",
          title: "group-[.toast]:text-[hsl(var(--notification-foreground))] group-[.toast]:font-semibold",
          description: "group-[.toast]:text-[hsl(var(--notification-muted))]",
          actionButton:
            "group-[.toast]:bg-[hsl(var(--notification-foreground))] group-[.toast]:text-[hsl(var(--notification-surface))]",
          cancelButton:
            "group-[.toast]:bg-[hsl(var(--notification-foreground)/0.12)] group-[.toast]:text-[hsl(var(--notification-foreground))]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
