import type { ReactNode } from "react";
import "../styles/home.css";
import "../styles/features.css";
import "../styles/motion.css";

interface HomeLayoutProperties {
  readonly children: ReactNode;
}

const HomeLayout = ({ children }: HomeLayoutProperties) => children;

export default HomeLayout;
