import AEFlag from "circle-flags/flags/ae.svg";
import ATFlag from "circle-flags/flags/at.svg";
import AUFlag from "circle-flags/flags/au.svg";
import BEFlag from "circle-flags/flags/be.svg";
import BRFlag from "circle-flags/flags/br.svg";
import CAFlag from "circle-flags/flags/ca.svg";
import CHFlag from "circle-flags/flags/ch.svg";
import CNFlag from "circle-flags/flags/cn.svg";
import CZFlag from "circle-flags/flags/cz.svg";
import DEFlag from "circle-flags/flags/de.svg";
import DKFlag from "circle-flags/flags/dk.svg";
import EEFlag from "circle-flags/flags/ee.svg";
import ESFlag from "circle-flags/flags/es.svg";
import EUFlag from "circle-flags/flags/eu.svg";
import FIFlag from "circle-flags/flags/fi.svg";
import FRFlag from "circle-flags/flags/fr.svg";
import GBFlag from "circle-flags/flags/gb.svg";
import HKFlag from "circle-flags/flags/hk.svg";
import HUFlag from "circle-flags/flags/hu.svg";
import ILFlag from "circle-flags/flags/il.svg";
import INFlag from "circle-flags/flags/in.svg";
import ITFlag from "circle-flags/flags/it.svg";
import JPFlag from "circle-flags/flags/jp.svg";
import KRFlag from "circle-flags/flags/kr.svg";
import LTFlag from "circle-flags/flags/lt.svg";
import LVFlag from "circle-flags/flags/lv.svg";
import MXFlag from "circle-flags/flags/mx.svg";
import NLFlag from "circle-flags/flags/nl.svg";
import NOFlag from "circle-flags/flags/no.svg";
import NZFlag from "circle-flags/flags/nz.svg";
import PLFlag from "circle-flags/flags/pl.svg";
import PTFlag from "circle-flags/flags/pt.svg";
import RUFlag from "circle-flags/flags/ru.svg";
import SAFlag from "circle-flags/flags/sa.svg";
import SEFlag from "circle-flags/flags/se.svg";
import SGFlag from "circle-flags/flags/sg.svg";
import TRFlag from "circle-flags/flags/tr.svg";
import TWFlag from "circle-flags/flags/tw.svg";
import USFlag from "circle-flags/flags/us.svg";
import XXFlag from "circle-flags/flags/xx.svg";
import ZAFlag from "circle-flags/flags/za.svg";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const regionName = (code: string) => regionNames.of(code) ?? code;

/**
 * IBKR's listing-location icon keys (market data field `7986`), each with
 * HatScripts' circle flag and the country's name. Every flag on the page
 * goes through these keys, whether IBKR sent one or the exchange gave it.
 */
export const locations = {
  TP_Australia: { src: AUFlag, country: regionName("AU") },
  TP_Austria: { src: ATFlag, country: regionName("AT") },
  TP_Belgium: { src: BEFlag, country: regionName("BE") },
  TP_Brazil: { src: BRFlag, country: regionName("BR") },
  TP_Canada: { src: CAFlag, country: regionName("CA") },
  TP_China: { src: CNFlag, country: regionName("CN") },
  TP_Czech: { src: CZFlag, country: regionName("CZ") },
  TP_Denmark: { src: DKFlag, country: regionName("DK") },
  TP_Estonia: { src: EEFlag, country: regionName("EE") },
  TP_EU: { src: EUFlag, country: "European Union" },
  TP_Finland: { src: FIFlag, country: regionName("FI") },
  TP_France: { src: FRFlag, country: regionName("FR") },
  TP_Germany: { src: DEFlag, country: regionName("DE") },
  TP_Global: { src: XXFlag, country: "Global" },
  TP_Hong_Kong: { src: HKFlag, country: regionName("HK") },
  TP_Hungary: { src: HUFlag, country: regionName("HU") },
  TP_India: { src: INFlag, country: regionName("IN") },
  TP_Israel: { src: ILFlag, country: regionName("IL") },
  TP_Italy: { src: ITFlag, country: regionName("IT") },
  TP_Japan: { src: JPFlag, country: regionName("JP") },
  TP_Latvia: { src: LVFlag, country: regionName("LV") },
  TP_Lithuania: { src: LTFlag, country: regionName("LT") },
  TP_Mexico: { src: MXFlag, country: regionName("MX") },
  TP_Netherlands: { src: NLFlag, country: regionName("NL") },
  TP_Norway: { src: NOFlag, country: regionName("NO") },
  TP_Poland: { src: PLFlag, country: regionName("PL") },
  TP_Portugal: { src: PTFlag, country: regionName("PT") },
  TP_Russian_Federation: { src: RUFlag, country: regionName("RU") },
  TP_Singapore: { src: SGFlag, country: regionName("SG") },
  TP_SouthAfrica: { src: ZAFlag, country: regionName("ZA") },
  TP_South_Korea: { src: KRFlag, country: regionName("KR") },
  TP_Spain: { src: ESFlag, country: regionName("ES") },
  TP_Sweden: { src: SEFlag, country: regionName("SE") },
  TP_Switzerland: { src: CHFlag, country: regionName("CH") },
  TP_Taiwan: { src: TWFlag, country: regionName("TW") },
  "TP_United Kingdom": { src: GBFlag, country: regionName("GB") },
  TP_US: { src: USFlag, country: regionName("US") },
  // Not IBKR keys: IBKR has no flag for these countries, but
  // their currencies still need one (see `currency-flag.tsx`).
  TP_New_Zealand: { src: NZFlag, country: regionName("NZ") },
  TP_Saudi_Arabia: { src: SAFlag, country: regionName("SA") },
  TP_Turkey: { src: TRFlag, country: regionName("TR") },
  TP_United_Arab_Emirates: { src: AEFlag, country: regionName("AE") },
};

export type LocationKey = keyof typeof locations;

export const isLocationKey = (key: string): key is LocationKey =>
  Object.hasOwn(locations, key);
