# Europa 2029 — site protegido com progresso compartilhado

Este ZIP contém um site real para publicar na Netlify. A parte visual foi inspirada no PDF **Europa_2029_Plano_Economia_Diario_Semanal_Mensal.pdf**.

## O que funciona

- 1.012 dias: **24/11/2026 a 31/08/2029**.
- R$ 30 por pessoa/dia (R$ 23 para euros + R$ 7 para passagens).
- Meta de R$ 60.720 para o casal, sendo R$ 30.360 para cada pessoa.
- Duas pessoas com registro diário individual; clique para marcar R$ 30 e use ✎ para valores personalizados.
- 145 semanas, 34 meses e calendário de **20 trocas de euros a cada 49 dias + fechamento de 32 dias**.
- Compra de euros: registrar conclusão, reais pagos e euros recebidos de cada pessoa.
- Backup JSON para baixar; restauração JSON pelo administrador.
- Um **banco JSON privado e persistente (Netlify Blobs)**, compartilhado automaticamente entre os navegadores.
- **PIN de administrador** (pode alterar) e **PIN de visualização** (pode apenas acompanhar).
- O painel de visualização recarrega os dados a cada 45 segundos, quando a página está ativa, ou ao voltar à página. Também pode clicar em atualizar.

## Estrutura

```text
Europa_2029_Netlify_Moderno/
├── public/
│   ├── index.html         ← site
│   ├── style.css          ← visual
│   ├── app.js             ← interface e sincronização
│   └── plano.json         ← referência pública das metas, SEM dados particulares
├── netlify/
│   ├── functions/
│   │   ├── auth.mjs       ← autenticação, sessão e limites de tentativa
│   │   └── progress.mjs   ← API protegida de leitura e gravação
│   └── lib/shared.mjs     ← validações, cookies e segurança
├── netlify.toml           ← publicação da pasta public + funções
├── package.json          ← dependência @netlify/blobs
├── tests/                ← testes automatizados
└── LEIA-ME.md
```

**IMPORTANTE:** SOMENTE `public/` será publicada como conteúdo estático. Funções do servidor não são arquivos públicos do site. O JSON de progresso *não* está em `public/`: ele é guardado no Netlify Blobs, acessível apenas pela API protegida.

## Publicar na Netlify

### Opção recomendada: conectar ao GitHub

1. Extraia o ZIP no seu computador.
2. Crie um repositório GitHub **privado** e envie todos os arquivos da pasta extraída, preservando `public`, `netlify`, `package.json` e `netlify.toml`.
3. Netlify → **Add new project** → **Import an existing project** → selecione o repositório.
4. O `netlify.toml` já define `publish = "public"` e `functions = "netlify/functions"`. Não precisa inventar comando de build.
5. Em Netlify → **Project configuration → Environment variables**, crie estas TRÊS variáveis (escopo **Functions** ou **All**, em produção):

| Variável | O que colocar |
|---|---|
| `APP_ADMIN_PASSWORD` | Sua senha pessoal de EXATAMENTE 6 números |
| `APP_VIEWER_PASSWORD` | Outra senha **diferente**, de EXATAMENTE 6 números, para sua namorada |
| `APP_SESSION_SECRET` | Segredo aleatório de 48 caracteres ou mais, separado das senhas |

Para gerar o segredo no Windows PowerShell, se tiver Node instalado:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copie o texto gerado e use apenas como valor da variável `APP_SESSION_SECRET`. **Não envie as senhas aqui no chat e não as coloque no HTML, no JSON, no GitHub ou no ZIP.**

6. Faça o primeiro deploy/redeploy após configurar essas variáveis.
7. Abra a URL `https://seu-site.netlify.app`. Faça login como **Administrador** para registrar os depósitos; envie a URL e **somente o PIN de visualização** para sua namorada.
8. Acesse `https://seu-site.netlify.app/.netlify/functions/auth` no navegador para verificar se a API responde JSON (é normal responder `authenticated:false` sem login). Se retornar `404`, as Functions não foram publicadas; use o deploy via Git/GitHub.

### Alternativa: Netlify Drop

Em projetos conectados a uma conta Netlify, a publicação por *drag & drop* pode executar uma etapa de build. Mas, **se publicar apenas o `index.html` ou apenas a pasta `public`, a autenticação e o banco NÃO FUNCIONAM**. Envie o projeto completo, e confira se as Functions foram geradas. Para maior confiabilidade e atualizações futuras, use GitHub conectado à Netlify.

## Como usar diariamente

1. Escolha **Diário** e o mês desejado.
2. Clique no botão de cada pessoa; ele alterna entre R$ 0 e R$ 30.
3. Para valores como R$ 10 ou R$ 50, clique em ✎ na mesma linha e informe os dois depósitos.
4. Espere a indicação **Sincronizado**. A sua namorada verá as alterações na conta de visualização.
5. Na data de troca de euros, vá até **Trocar euros → Registrar/editar**, e informe BRL gasto, EUR recebidos e quem comprou.
6. Faça um **backup em JSON** regularmente em Configurações. Você também poderá importar esse arquivo se precisar restaurar o plano.

## Segurança e limites

- Os dados reais de progresso são privados e exigem sessão autenticada para ler ou alterar.
- Apenas o administrador pode alterar depósitos, nomes e compras de euros.
- As senhas ficam no painel de variáveis da Netlify, **não no site**.
- Cookies de sessão são assinados, HttpOnly, SameSite Strict e Secure em HTTPS, com validade de 7 dias. O login limita a cinco tentativas incorretas por janela de 15 minutos e por IP. Seis números são menos seguros que uma senha longa: não compartilhe os códigos nem publique em arquivos.
- A gravação usa uma verificação de versão para evitar sobrescrever silenciosamente dados de outra aba.
- Se mudar as senhas, atualize também `APP_SESSION_SECRET` para encerrar todas as sessões existentes.
- O `plano.json` é **público** e contém só as metas fixas, sem nomes, saldos ou registros particulares.
- Não existe acesso a conta bancária, nem conversão real automatizada; são registros manuais.
- Comprar euros a cada 49 dias é uma **regra do seu planejamento**, não uma recomendação de investimento.
- O backup JSON contém seus nomes e valores guardados: guarde-o em local privado.
- Netlify Blobs e Netlify Functions estão sujeitos aos limites e preços do seu plano Netlify.
- A passagem aérea de R$ 6.500 foi considerada **por pessoa**, igual ao PDF.

## Testes locais de código

Execute `npm install`, `npm test` e `npm run check` para validar. Para rodar as Functions localmente, use `npx netlify dev` com as mesmas variáveis de ambiente (em arquivo `.env` local **não enviado ao Git**). O teste visual via abertura isolada do `index.html` não conecta o banco: é necessário Netlify Dev ou o site publicado.

## Referências Netlify

- https://docs.netlify.com/build/data-and-storage/netlify-blobs/
- https://docs.netlify.com/build/functions/configuration/
- https://docs.netlify.com/build/functions/environment-variables/

## Atualização de visual e senhas em seis dígitos

- O login aceita exatamente seis números. As duas senhas DEVEM continuar diferentes.
- Os PINs são configurados somente em Environment variables na Netlify. O projeto não inclui senhas reais.
- Após publicar uma alteração de código, confirme em **Deploys** que a nova versão foi publicada; se alterar os PINs, inicie outro deploy para aplicar.
- A tela de login é pública para quem conhece o link, mas o progresso JSON e a edição exigem autenticação no servidor. Os registros são armazenados separadamente em Netlify Blobs.
- Há modo escuro (padrão) e claro. A preferência visual é mantida somente no navegador de cada pessoa.
- Os dados do site antigo são preservados **se continuar usando o mesmo projeto Netlify**: não crie outro projeto nem altere o identificador do armazenamento.

## Atualizar o projeto Travel2029 existente (Windows / PowerShell)

1. Extraia este ZIP. Abra a pasta que contém o repositório `Travel2029` no seu computador.
2. Copie **todo o conteúdo** extraído para dentro da pasta existente e aceite substituir os arquivos. Preserve a pasta `.git` do seu repositório.
3. No PowerShell, dentro da pasta do projeto, execute:

```powershell
npm install
npm test
npm run check
git add -A
git commit -m "Atualizar visual e acesso de 6 digitos"
git push origin main
```

4. Confirme a publicação em Netlify → Deploys. O site terá a tela de acesso simplificada e painel em modo escuro.
5. Se as variáveis `APP_ADMIN_PASSWORD` e `APP_VIEWER_PASSWORD` **já contêm os dois PINs diferentes de seis dígitos**, não é necessário redefini-los. `APP_SESSION_SECRET` deve continuar com ao menos 48 caracteres.
6. Faça uma cópia JSON do progresso antes de atualizar, especialmente se você já registrou economias.

Este ZIP é para **substituir o código do mesmo site Netlify**, não para criar outra instância. Assim ele continua consultando o mesmo banco.
