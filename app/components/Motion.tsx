"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

export default function Motion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
