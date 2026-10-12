import { Router } from "@solidjs/router"
import { FileRoutes } from "@solidjs/start/router"
import { Font } from "@opencode/ui/font"
import { MetaProvider } from "@solidjs/meta"
import { MarkedProvider } from "@opencode/ui/context/marked"
import { DialogProvider } from "@opencode/ui/context/dialog"
import { I18nProvider } from "@opencode/ui/context"
import {
  pluralCategory,
  pluralKey,
  type UiI18nParams,
  type UiI18nPluralKey,
  type UiPluralCategory,
  type UiTranslate,
} from "@opencode/ui/context/i18n"
import { dict as uiEn } from "@opencode/ui/i18n/en"
import { createEffect, Suspense, type ParentProps } from "solid-js"
import "./app.css"
import { Favicon } from "@opencode/ui/favicon"

function resolveTemplate(text: string, params?: UiI18nParams) {
  if (!params) return text
  return text.replace(/{{\s*([^}]+?)\s*}}/g, (_, rawKey) => {
    const key = String(rawKey)
    const value = params[key]
    return value === undefined ? "" : String(value)
  })
}

function UiI18nBridge(props: ParentProps) {
  const locale = () => "en"
  const translate = (key: keyof typeof uiEn, params?: UiI18nParams) => {
    const value = uiEn[key]
    const text = value ?? String(key)
    return resolveTemplate(text, params)
  }
  const t = translate as UiTranslate
  const pluralForm = (key: UiI18nPluralKey, category: UiPluralCategory, params?: UiI18nParams) => {
    const candidate = pluralKey(key, category)
    const fallback = pluralKey(key, "other")
    const value = uiEn[candidate] ?? uiEn[fallback]
    return resolveTemplate(value ?? fallback, params)
  }
  const plural = (key: UiI18nPluralKey, count: number, params?: UiI18nParams) =>
    pluralForm(key, pluralCategory(locale(), count), { ...params, count })

  createEffect(() => {
    if (typeof document !== "object") return
    document.documentElement.lang = locale()
  })

  return <I18nProvider value={{ locale, t, plural, pluralForm }}>{props.children}</I18nProvider>
}

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <DialogProvider>
            <MarkedProvider>
              <Favicon />
              <Font />
              <UiI18nBridge>
                <Suspense>{props.children}</Suspense>
              </UiI18nBridge>
            </MarkedProvider>
          </DialogProvider>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  )
}
