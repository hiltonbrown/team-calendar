import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactElement } from "react";

export interface EarlyAccessApplicationEmailProps {
  calendarClient: string;
  companySize: string;
  country: string;
  currentProcess: string;
  email: string;
  heardFrom: string;
  reference: string;
  usesXeroPayroll: string;
}

export const EarlyAccessApplicationEmail = (
  props: EarlyAccessApplicationEmailProps
): ReactElement => (
  <Html>
    <Head />
    <Preview>Early access application {props.reference}</Preview>
    <Body className="bg-zinc-50 font-sans">
      <Container className="mx-auto py-10">
        <Section className="rounded-2xl bg-white p-8">
          <Text className="font-semibold text-xl">
            AU early access application
          </Text>
          <Text>Reference: {props.reference}</Text>
          <Text>Email: {props.email}</Text>
          <Text>Company size: {props.companySize}</Text>
          <Text>Country: {props.country}</Text>
          <Text>Uses Xero Payroll: {props.usesXeroPayroll}</Text>
          <Text>Calendar client: {props.calendarClient}</Text>
          <Text>Current process: {props.currentProcess}</Text>
          <Text>Acquisition source: {props.heardFrom}</Text>
        </Section>
      </Container>
    </Body>
  </Html>
);
