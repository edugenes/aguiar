# 📱 Aguiar Catálogo - Versão Android

Este projeto agora suporta duas versões:

## 🌐 Versão Web (PC)
- **Backend**: Node.js + Express + SQLite
- **Frontend**: React + Vite
- **Uso**: Acesse `http://localhost:5174` após iniciar os servidores

## 📱 Versão Android (Standalone)
- **Frontend**: React + Capacitor
- **Armazenamento**: LocalStorage (funciona offline)
- **Sem servidor**: Tudo funciona localmente no dispositivo

---

## 🚀 Como construir o APK Android

### Pré-requisitos
1. **Android Studio** instalado
2. **Java JDK** (versão 11 ou superior)
3. **Node.js** e npm instalados

### Passos

1. **Fazer build do frontend:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Sincronizar com Capacitor:**
   ```bash
   npx cap sync android
   ```

3. **Abrir no Android Studio:**
   ```bash
   npx cap open android
   ```

4. **No Android Studio:**
   - Aguarde o Gradle sincronizar
   - Conecte um dispositivo Android ou inicie um emulador
   - Clique em "Run" (▶️) ou pressione `Shift + F10`

5. **Gerar APK para distribuição:**
   - No Android Studio: `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
   - Ou via linha de comando:
     ```bash
     cd android
     ./gradlew assembleRelease
     ```
   - O APK estará em: `android/app/build/outputs/apk/release/app-release.apk`

---

## 📋 Funcionalidades da Versão Android

✅ **Todas as funcionalidades da versão web:**
- Cadastro de produtos (nome, descrição, preço, categoria, SKU)
- Upload de imagens (convertidas para base64)
- Edição e exclusão de produtos
- Filtros por categoria e promoção
- Ordenação por preço e nome
- Configuração de layout do PDF
- Geração automática de SKU

✅ **Funciona offline:**
- Todos os dados são salvos localmente no dispositivo
- Não precisa de servidor ou internet

⚠️ **Em desenvolvimento:**
- Geração de PDF local (por enquanto, use a versão web)

---

## 🔧 Estrutura do Projeto

```
Aguiar/
├── backend/          # Versão web - Backend Node.js
├── frontend/         # Código React compartilhado
│   ├── src/
│   │   ├── services/
│   │   │   └── dataService.ts  # Detecta automaticamente web/mobile
│   │   ├── utils/
│   │   │   └── platform.ts     # Utilitários de plataforma
│   │   └── App.tsx              # App principal
│   └── android/      # Projeto Android nativo (gerado pelo Capacitor)
└── database/        # Banco SQLite (versão web)
```

---

## 🎯 Como funciona a detecção automática

O código detecta automaticamente se está rodando no **web** ou no **mobile**:

- **Web**: Usa API REST (`http://localhost:4000`)
- **Mobile**: Usa LocalStorage (offline)

O arquivo `src/services/dataService.ts` gerencia isso automaticamente.

---

## 📝 Notas Importantes

1. **Versão Web**: Continua funcionando normalmente com backend separado
2. **Versão Android**: Funciona standalone, sem necessidade de servidor
3. **Dados**: Não são compartilhados entre web e mobile (são ambientes separados)
4. **Build**: Sempre execute `npm run build` antes de `npx cap sync android`

---

## 🐛 Troubleshooting

**Erro ao abrir Android Studio:**
- Certifique-se de que o Android Studio está instalado
- Verifique se o caminho está correto no PATH

**Erro de build:**
- Execute `npm run build` primeiro
- Depois `npx cap sync android`

**APK muito grande:**
- Isso é normal na primeira build
- Use `./gradlew bundleRelease` para gerar AAB (mais otimizado)

---

## 📞 Próximos Passos

- [ ] Implementar geração de PDF local no mobile
- [ ] Adicionar sincronização de dados entre dispositivos
- [ ] Melhorar UI para mobile (navegação, gestos)
- [ ] Adicionar suporte a câmera nativa para fotos de produtos
