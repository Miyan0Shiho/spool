#!/usr/bin/env node

import { main } from "../dist/app/main.js";

process.exit(await main(process.argv.slice(2)));
