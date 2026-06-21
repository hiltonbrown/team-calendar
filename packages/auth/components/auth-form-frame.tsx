import type { ReactNode } from "react";

interface AuthFormFrameProperties {
  children: ReactNode;
  description: string;
  title: string;
}

export const AuthFormFrame = ({
  title,
  description,
  children,
}: AuthFormFrameProperties) => (
  <div className="space-y-6">
    <div className="space-y-2 text-center">
      <h1 className="font-semibold text-2xl text-foreground tracking-normal">
        {title}
      </h1>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
    {children}
  </div>
);
