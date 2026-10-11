import { Label, RadioGroup, RadioGroupItem } from "@repo/design-system";

export const Default = () => (
  <RadioGroup defaultValue="named">
    <div className="flex items-center gap-2">
      <RadioGroupItem id="privacy-named" value="named" />
      <Label htmlFor="privacy-named">Named</Label>
    </div>
    <div className="flex items-center gap-2">
      <RadioGroupItem id="privacy-masked" value="masked" />
      <Label htmlFor="privacy-masked">Masked</Label>
    </div>
    <div className="flex items-center gap-2">
      <RadioGroupItem id="privacy-private" value="private" />
      <Label htmlFor="privacy-private">Private</Label>
    </div>
  </RadioGroup>
);

const options = [
  { value: "named", label: "Named", description: "Show each person's name and leave type." },
  { value: "masked", label: "Masked", description: "Show names with leave shown as Away." },
  { value: "private", label: "Private", description: "Show busy blocks only, with no names." },
];

export const WithDescriptions = () => (
  <RadioGroup className="w-[420px]" defaultValue="masked">
    {options.map((option) => (
      <div
        className="flex items-start gap-3 rounded-sm bg-surface-container px-4 py-3"
        key={option.value}
      >
        <RadioGroupItem className="mt-0.5" id={`feed-privacy-${option.value}`} value={option.value} />
        <div>
          <Label htmlFor={`feed-privacy-${option.value}`}>{option.label}</Label>
          <p className="text-label-md text-muted-foreground">{option.description}</p>
        </div>
      </div>
    ))}
  </RadioGroup>
);

export const Disabled = () => (
  <RadioGroup defaultValue="full" disabled>
    <div className="flex items-center gap-2">
      <RadioGroupItem id="day-full" value="full" />
      <Label htmlFor="day-full">Full day</Label>
    </div>
    <div className="flex items-center gap-2">
      <RadioGroupItem id="day-half" value="half" />
      <Label htmlFor="day-half">Half day</Label>
    </div>
  </RadioGroup>
);
