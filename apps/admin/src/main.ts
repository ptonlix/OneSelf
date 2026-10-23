import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { readRootElement } from "./browser";
import "./brand.css";
import "./styles.css";
import { AdminApp } from "./ui";

const root = readRootElement();
createRoot(root).render(createElement(AdminApp));
