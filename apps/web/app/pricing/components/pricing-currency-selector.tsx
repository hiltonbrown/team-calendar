"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { countryOptions, getCurrencyPricingState } from "../constants";
import { PricingComparison } from "./pricing-comparison";
import { PricingPlans } from "./pricing-plans";

const CountrySlider = ({
  countryIndex,
  onSelectCountry,
}: {
  countryIndex: number;
  onSelectCountry: (idx: number) => void;
}) => {
  const activeCountry = countryOptions[countryIndex] ?? countryOptions[0];

  return (
    <div className="fmkt-pricing-controls-bar">
      <div className="fmkt-country-slider-container">
        <div className="fmkt-country-slider-header">
          <div className="fmkt-country-slider-badge">
            <span aria-hidden="true" className="fmkt-country-slider-dot" />
            <span>Multi-region payroll pricing</span>
          </div>
          <span className="fmkt-country-slider-active-hint">
            Showing pricing for{" "}
            <strong>
              {activeCountry.name} ({activeCountry.code})
            </strong>
          </span>
        </div>

        <div className="fmkt-country-slider-track-wrap">
          <div className="fmkt-country-slider-bar">
            <div
              className="fmkt-country-slider-fill"
              style={{
                width: `${(countryIndex / (countryOptions.length - 1)) * 100}%`,
              }}
            />
          </div>
          <input
            aria-label="Select country for pricing"
            className="fmkt-country-slider-range"
            max={countryOptions.length - 1}
            min={0}
            onChange={(e) => onSelectCountry(Number(e.target.value))}
            step={1}
            type="range"
            value={countryIndex}
          />
        </div>

        <div
          aria-label="Country pricing selection"
          className="fmkt-country-slider-stops"
          role="tablist"
        >
          {countryOptions.map((opt, idx) => {
            const isActive = countryIndex === idx;
            return (
              <button
                aria-selected={isActive}
                className={[
                  "fmkt-country-slider-stop",
                  isActive ? "fmkt-country-slider-stop--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={opt.code}
                onClick={() => onSelectCountry(idx)}
                role="tab"
                type="button"
              >
                <div className="fmkt-country-slider-stop__flag-wrap">
                  <span className="fmkt-country-slider-stop__flag">
                    {opt.flag}
                  </span>
                  <span className="fmkt-country-slider-stop__name">
                    {opt.name}
                  </span>
                </div>
                <div className="fmkt-country-slider-stop__rates">
                  <span className="fmkt-country-slider-stop__code">
                    {opt.code}
                  </span>
                  <span className="fmkt-country-slider-stop__prices">
                    {opt.starterPrice} / {opt.premiumPrice}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
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
        <CountrySlider
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
