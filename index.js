// =======================================================
// PARTE 1: CÓDIGO PRINCIPAL DO BOT
// =======================================================

// IMPORTS
const {
  Client,
  Events,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');

const { token } = require('./config.json');
const fs = require('fs');
const { randomUUID } = require('crypto'); // 🔹 para IDs únicos

// ARQUIVO JSON
const FILE = './users.json';

// FUNÇÕES
function loadUsers() {
  if (!fs.existsSync(FILE)) return {};

  let data = JSON.parse(fs.readFileSync(FILE));

  // Limpa dados inválidos
  for (const userId in data) {
    if (!Array.isArray(data[userId])) {
      console.log(`⚠️ Corrigindo dados inválidos para usuário ${userId}`);
      data[userId] = [];
    }
  }

  return data;
}

function saveUsers(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// CLIENT
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// BOT LIGOU
client.once(Events.ClientReady, (readyClient) => {
  console.log(`✅ Logado como ${readyClient.user.tag}`);

  // ⏰ ALARME (Configurado para 1 minuto para testes)
  setInterval(async () => {
    const users = loadUsers();

    for (const userId in users) {
      if (!Array.isArray(users[userId])) users[userId] = [];

      const lista = users[userId];
      for (const item of lista) {
        // Removida a trava de data para facilitar os testes locais
        if (item.dia === hoje && !item.pago) {
          try {
            const user = await client.users.fetch(userId);
            const dm = user.dmChannel || await user.createDM();

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`paguei_${item.id}`)
                .setLabel('✅ Paguei')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`nao_${item.id}`)
                .setLabel('❌ Não paguei')
                .setStyle(ButtonStyle.Danger)
            );

            const mensagemEnviada = await dm.send({
              content: `💰 ${item.descricao} vence hoje!\nVocê já pagou?`,
              components: [row]
            });

            // Salva múltiplas mensagens DM
            if (!item.lastMessageIds) item.lastMessageIds = [];
            item.lastMessageIds.push(mensagemEnviada.id);

          } catch (err) {
            console.log(`Erro ao enviar DM para ${userId}:`, err);
          }
        }
      }
    }

    saveUsers(users);

  }, 1000 * 60 * 60 * 6); // 6 horas
});

// ================= INTERAÇÕES =================
client.on(Events.InteractionCreate, async (interaction) => {

  if (interaction.isButton()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const users = loadUsers();
    const [acao, id] = interaction.customId.split('_');
    const userId = interaction.user.id;

    if (!Array.isArray(users[userId])) users[userId] = [];

    const lista = users[userId];
    if (!lista) return;

    const item = lista.find(f => f.id.toString() === id.toString());

    if (!item) return interaction.editReply({ content: '❌ Fatura não encontrada!' });

    if (acao === 'paguei') {
      let mensagemRetorno = '✅ Pagamento confirmado!';
      
      // 🎯 VERIFICAÇÃO DE PARCELAS INTEGRADAS AQUI:
      if (item.parcelaAtual >= item.parcelasTotal) {
        // Se já era a última parcela, remove da lista
        const index = lista.findIndex(f => f.id.toString() === id.toString());
        lista.splice(index, 1);
        mensagemRetorno = `🎉 Boas notícias! Você quitou todas as parcelas de **${item.descricao}** e ela foi removida da sua lista!`;
      } else {
        // Se ainda não era a última, apenas soma 1 e marca como pago
        item.pago = true;
        item.parcelaAtual++;
      }

      saveUsers(users);

      // 🔄 Atualiza todas as mensagens DM dessa fatura para sumir os botões
      if (item.lastMessageIds && item.lastMessageIds.length > 0) {
        try {
          const user = await client.users.fetch(userId);
          const dm = user.dmChannel || await user.createDM();

          for (const msgId of item.lastMessageIds) {
            try {
              const msg = await dm.messages.fetch(msgId);
              await msg.edit({
                content: `💰 ${item.descricao} vence hoje!\n✅ Você marcou como pago!`,
                components: []
              });
            } catch { /* ignora se a mensagem não existir */ }
          }

        } catch (err) {
          console.log(`Não foi possível atualizar as DMs de ${userId}:`, err);
        }
      }

      return interaction.editReply({ content: mensagemRetorno });
    }

    if (acao === 'nao') {
      return interaction.editReply({ content: '❌ Ok, vou continuar te lembrando!' });
    }
  }

  // ================= SLASH COMMAND =================
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;
  const users = loadUsers();

  // ================= CADASTRAR =================
  if (interaction.commandName === 'cadastrar') {
    await interaction.deferReply();

    try {
      const usuario = interaction.options.getUser('usuario');
      const dia = interaction.options.getInteger('dia');
      const descricao = interaction.options.getString('descricao');
      const parcelas = interaction.options.getInteger('parcelas');

      if (dia < 1 || dia > 31)
        return interaction.editReply({ content: '❌ Dia inválido' });

      if (!Array.isArray(users[usuario.id])) users[usuario.id] = [];

      users[usuario.id].push({
        id: randomUUID(), // 🔹 ID único
        dia,
        descricao,
        parcelasTotal: parcelas,
        parcelaAtual: 1,
        pago: false,
        lastMessageIds: [] // 🔹 suporte a múltiplas mensagens
      });

      saveUsers(users);

      return interaction.editReply({
        content: `✅ ${usuario} cadastrado!\n📅 Dia: ${dia}\n📝 ${descricao}\n📦 Parcelas: ${parcelas}`
      });

    } catch (err) {
      console.error(err);
      return interaction.editReply({ content: '❌ Erro ao cadastrar' });
    }
  }

  // ================= LISTAR =================
  if (interaction.commandName === 'listar') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!users[userId] || users[userId].length === 0) {
      return interaction.editReply({ content: '❌ Você não tem faturas' });
    }

    let mensagem = '📋 Suas faturas:\n\n';

    users[userId].forEach(item => {
      const status = item.pago ? '✅ Pago' : '❌ Pendente';

      mensagem += `ID: ${item.id}\n`;
      mensagem += `📅 Dia: ${item.dia}\n`;
      mensagem += `📝 ${item.descricao}\n`;
      mensagem += `📦 ${item.parcelaAtual}/${item.parcelasTotal}\n`;
      mensagem += `💳 Status: ${status}\n\n`;
    });

    return interaction.editReply({ content: mensagem });
  }

  // ================= DELETAR =================
  if (interaction.commandName === 'deletar') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const id = interaction.options.getString('id');
    if (!users[userId]) return interaction.editReply({ content: '❌ Nenhuma fatura encontrada' });

    const index = users[userId].findIndex(item => item.id.toString() === id.toString());
    if (index === -1) return interaction.editReply({ content: '❌ ID não encontrado' });

    users[userId].splice(index, 1);
    saveUsers(users);

    return interaction.editReply({ content: '🗑️ Fatura deletada!' });
  }

});

// LOGIN
client.login(token);


// =======================================================
// PARTE 2: REGISTRO DE COMANDOS (SLASH COMMANDS)
// =======================================================

const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { clientId, guildId } = require('./config.json');

const commands = [

  // 📦 CADASTRAR
  new SlashCommandBuilder()
    .setName('cadastrar')
    .setDescription('Cadastrar fatura')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Quem será marcado')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('dia')
        .setDescription('Dia do pagamento')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('descricao')
        .setDescription('Descrição')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('parcelas')
        .setDescription('Quantidade de parcelas')
        .setRequired(true)
    )
    .toJSON(),

  // 📋 LISTAR
  new SlashCommandBuilder()
    .setName('listar')
    .setDescription('Listar suas faturas')
    .toJSON(),

  // 🗑️ DELETAR
  new SlashCommandBuilder()
    .setName('deletar')
    .setDescription('Deletar uma fatura')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('ID da fatura')
        .setRequired(true)
    )
    .toJSON()

];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Registrando comandos...');

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log('Comandos registrados!');
  } catch (error) {
    console.error(error);
  }
})();