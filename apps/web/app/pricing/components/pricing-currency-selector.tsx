"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { supportMailtoHref } from "@/src/data/support";
import {
  getCurrencyPricingState,
  isPricingCurrency,
  type PricingCurrency,
  pricingCurrencies,
  pricingCurrencyOptions,
} from "../constants";

export const PricingCurrencySelector = ({
  audPricing,
}: {
  audPricing: ReactNode;
}) => {
  const [currency, setCurrency] = useState<PricingCurrency>("AUD");
  const state = getCurrencyPricingState(currency);
  return (
    <div className="fmkt-pricing-region">
      <label className="fmkt-pricing-currency">
        Currency
        <select
          aria-label="Currency and country"
          onChange={(event) => {
            const { value } = event.currentTarget;
            if (isPricingCurrency(value)) {
              setCurrency(value);
            }
          }}
          value={currency}
        >
          {pricingCurrencyOptions.map((value) => (
            <option key={value} value={value}>
              {pricingCurrencies[value].label} ·{" "}
              {pricingCurrencies[value].country}
            </option>
          ))}
        </select>
      </label>
      <div aria-live="polite" className="fmkt-pricing-region__panel">
        <h2>{state.heading}</h2>
        {state.available ? (
          audPricing
        ) : (
          <div className="fmkt-plan-fallback">
            <h3>{state.heading}</h3>
            <p>
              Contact us if you would like an update when {state.region.country}{" "}
              pricing becomes available.
            </p>
            <a
              className="marketing-btn marketing-btn--secondary"
              href={supportMailtoHref}
            >
              Contact support
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
