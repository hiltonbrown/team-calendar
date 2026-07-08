import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/design-system/components/ui/avatar";

export const WithFallback = () => (
  <Avatar className="size-9">
    <AvatarFallback>PN</AvatarFallback>
  </Avatar>
);

export const WithImage = () => (
  <Avatar className="size-9">
    <AvatarImage
      alt="Priya Nair"
      src="https://api.dicebear.com/9.x/avataaars/svg?seed=Priya%20Nair"
    />
    <AvatarFallback>PN</AvatarFallback>
  </Avatar>
);

export const TeamRow = () => (
  <div className="flex items-center -space-x-2">
    <Avatar className="size-9 border-2 border-background">
      <AvatarFallback>PN</AvatarFallback>
    </Avatar>
    <Avatar className="size-9 border-2 border-background">
      <AvatarFallback>JW</AvatarFallback>
    </Avatar>
    <Avatar className="size-9 border-2 border-background">
      <AvatarFallback>SK</AvatarFallback>
    </Avatar>
  </div>
);
