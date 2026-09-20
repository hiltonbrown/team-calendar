"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { countryOptions, getCurrencyPricingState } from "../constants";
import { PricingComparison } from "./pricing-comparison";
import { PricingPlans } from "./pricing-plans";

const CountrySelector = ({
  countryIndex,
  onSelectCountry,
}: {
  countryIndex: number;
  onSelectCountry: (idx: number) => void;
}) => {
  const activeCountry = countryOptions[countryIndex] ?? countryOptions[0];

  return (
    <div className="fmkt-pricing-controls-bar">
      <div className="fmkt-country-selector-container">
        <div className="fmkt-country-selector-header">
          <div className="fmkt-country-selector-badge">
            <span aria-hidden="true" className="fmkt-country-selector-dot" />
            <span>Multi-region payroll pricing</span>
          </div>
          <span className="fmkt-country-selector-active-hint">
            Showing pricing for{" "}
            <strong>
              {activeCountry.name} ({activeCountry.code})
            </strong>
          </span>
        </div>

        <fieldset className="fmkt-country-selector-options">
          <legend className="sr-only">Country pricing selection</legend>
          {countryOptions.map((opt, idx) => {
            const isActive = countryIndex === idx;
            return (
              <label
                className={[
                  "fmkt-country-selector-option",
                  isActive ? "fmkt-country-selector-option--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={opt.code}
              >
                <span className="fmkt-country-selector-option__label">
                  <input
                    checked={isActive}
                    name="pricing-country"
                    onChange={() => onSelectCountry(idx)}
                    type="radio"
                    value={opt.code}
                  />
                  <span className="fmkt-country-selector-option__name">
                    {opt.name}
                  </span>
                </span>
                <span className="fmkt-country-selector-option__rates">
                  <span className="fmkt-country-selector-option__code">
                    {opt.code}
                  </span>
                  <span className="fmkt-country-selector-option__prices">
                    {opt.starterPrice} / {opt.premiumPrice}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>
    </div>
  );
};

export const PricingCurrencySelector = ({
  audPricing: _audPricing,
}: {
  audPricing?: ReactNode;
} = {}) => {
  const [countryIndex, setCountryIndex] = useState(0);

  const activeCountry = countryOptions[countryIndex] ?? countryOptions[0];
  const state = getCurrencyPricingState(activeCountry.code);

  return (
    <div className="fmkt-pricing-stage-wrap">
      <div className="fmkt-container">
        <CountrySelector
          countryIndex={countryIndex}
          onSelectCountry={setCountryIndex}
        />

        <div aria-live="polite" className="fmkt-pricing-region__panel">
          <div className="fmkt-pricing-panel-header">
            <h2 className="fmkt-pricing-panel-heading">{state.heading}</h2>
            <p className="fmkt-pricing-panel-sub">
              Billed monthly in {activeCountry.code}. All plans include a 14-day
              free trial.
            </p>
          </div>

          <section className="fmkt-pricing-plans">
            <PricingPlans country={activeCountry} />
          </section>
        </div>
      </div>

      <PricingComparison country={activeCountry} />
    </div>
  );
};
