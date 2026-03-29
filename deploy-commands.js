const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { token, clientId, guildId } = require('./config.json');

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
    /* AJUSTADO: Mudado para StringOption para aceitar os IDs em formato texto */
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