#!/usr/bin/env node
import { runContaboPreflightOperator } from '../src/ubercloud-contabo-preflight-operator.mjs';

const result=await runContaboPreflightOperator();
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
process.exitCode=result.ok?0:2;
