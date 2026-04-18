/**
 * @dcgp/paths - 16 community domain paths.
 *
 * Register all at once:
 *   classifier.registerMany(ALL_PATHS)
 *
 * Register by category:
 *   classifier.registerMany(PATH_CATEGORIES.blockchain)
 *
 * Register individually:
 *   classifier.register(nodejs)
 */

import type { ContextPath } from "@dcgp/core";

import { nodejs } from "./web/nodejs";
import { python } from "./web/python";
import { dotnet } from "./web/dotnet";
import { golang } from "./web/golang";
import { rust } from "./web/rust";
import { react } from "./web/react";
import { vue } from "./web/vue";

import { evm } from "./blockchain/evm";
import { solana } from "./blockchain/solana";

import { dataEngineering } from "./data/data-engineering";
import { mlAi } from "./data/ml-ai";
import { devops } from "./data/devops";

import { reactNative } from "./mobile/react-native";
import { iosSwift } from "./mobile/ios-swift";
import { androidKotlin } from "./mobile/android-kotlin";

import { cpp } from "./systems/cpp";

export {
  nodejs,
  python,
  dotnet,
  golang,
  rust,
  react,
  vue,
  evm,
  solana,
  dataEngineering,
  mlAi,
  devops,
  reactNative,
  iosSwift,
  androidKotlin,
  cpp,
};

export const PATH_CATEGORIES: Readonly<Record<string, readonly ContextPath[]>> = {
  backend: [nodejs, python, dotnet, golang, rust],
  frontend: [react, vue],
  blockchain: [evm, solana],
  data: [dataEngineering, mlAi, devops],
  mobile: [reactNative, iosSwift, androidKotlin],
  systems: [cpp],
};

export const ALL_PATHS: readonly ContextPath[] = [
  ...PATH_CATEGORIES.backend!,
  ...PATH_CATEGORIES.frontend!,
  ...PATH_CATEGORIES.blockchain!,
  ...PATH_CATEGORIES.data!,
  ...PATH_CATEGORIES.mobile!,
  ...PATH_CATEGORIES.systems!,
];
