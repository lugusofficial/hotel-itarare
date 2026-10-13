// Atendente de demonstracao: balao de conversa que responde sobre os
// apartamentos, diarias, cafe da manha, eventos, horarios e como chegar, e
// entrega a conversa ao WhatsApp com a mensagem pronta.
//
// Duas partes separadas de proposito:
//   1. a interface (abrir, fechar, mensagens, chips, formulario), que nao sabe
//      de onde vem a resposta;
//   2. o cerebro, uma unica funcao responder(texto, memoria) que hoje e feita
//      de regras sobre o hotel.json e amanha pode virar um fetch para uma rota
//      com modelo de linguagem, sem mexer na interface.
//
// Progressivo: sem JavaScript o balao nem aparece, e o WhatsApp do rodape
// continua sendo o caminho de reserva.
(function () {
  'use strict';

  var raiz = document.querySelector('[data-atendente]');
  if (!raiz) { return; }

  var WA = raiz.getAttribute('data-whatsapp') || '#';
  var script = document.currentScript;
  var DADOS = script ? new URL('../data/hotel.json', script.src).href : 'data/hotel.json';

  // ------------------------------------------------------------- interface
  var abrir = raiz.querySelector('[data-atendente-abrir]');
  var fechar = raiz.querySelector('[data-atendente-fechar]');
  var painel = raiz.querySelector('[data-atendente-painel]');
  var lista = raiz.querySelector('[data-atendente-mensagens]');
  var chips = raiz.querySelector('[data-atendente-chips]');
  var form = raiz.querySelector('[data-atendente-form]');
  var campo = form && form.querySelector('input');
  if (!abrir || !fechar || !painel || !lista || !chips || !form || !campo) { return; }

  raiz.hidden = false;

  var hotel = null;
  var memoria = { hospedes: null, vista: null, tipo: null, datas: null };
  var saudou = false;

  function escapar(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function mensagem(html, de) {
    var li = document.createElement('li');
    li.setAttribute('data-de', de);
    li.innerHTML = html;
    lista.appendChild(li);
    lista.scrollTop = lista.scrollHeight;
  }

  function mostrarChips(itens) {
    chips.innerHTML = '';
    itens.forEach(function (item) {
      var li = document.createElement('li');
      if (item.href) {
        var a = document.createElement('a');
        a.href = item.href;
        a.textContent = item.rotulo;
        li.appendChild(a);
      } else {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = item.rotulo;
        b.addEventListener('click', function () { enviar(item.texto || item.rotulo); });
        li.appendChild(b);
      }
      chips.appendChild(li);
    });
  }

  function enviar(texto) {
    texto = (texto || '').trim();
    if (!texto) { return; }
    mensagem(escapar(texto), 'visitante');
    campo.value = '';
    var saida = responder(texto, memoria);
    saida.respostas.forEach(function (r) { mensagem(r, 'hotel'); });
    mostrarChips(saida.chips);
  }

  function abrirPainel() {
    painel.hidden = false;
    raiz.setAttribute('data-aberto', 'true');
    abrir.setAttribute('aria-expanded', 'true');
    if (!saudou) {
      saudou = true;
      mensagem('Olá! Sou o atendente de demonstração. Posso dizer quais apartamentos estão livres, a diária de cada um, como funciona o café da manhã e como chegar.', 'hotel');
      mostrarChips(chipsIniciais());
    }
    campo.focus();
  }

  function fecharPainel() {
    painel.hidden = true;
    raiz.removeAttribute('data-aberto');
    abrir.setAttribute('aria-expanded', 'false');
    abrir.focus();
  }

  abrir.addEventListener('click', abrirPainel);
  fechar.addEventListener('click', fecharPainel);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !painel.hidden) { fecharPainel(); }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    enviar(campo.value);
  });

  // Os dados sobem quando o balao abre pela primeira vez: quem nao conversa
  // nao baixa o hotel.json.
  abrir.addEventListener('click', function () {
    if (hotel) { return; }
    fetch(DADOS).then(function (r) { return r.json(); }).then(function (h) { hotel = h; })
      .catch(function () { hotel = null; });
  }, { once: true });

  function chipsIniciais() {
    return [
      { rotulo: 'Tem vista para o mar?' },
      { rotulo: 'Quanto custa a diária?' },
      { rotulo: 'Somos 6 pessoas', texto: 'Apartamento para 6 pessoas' },
      { rotulo: 'Como chegar' },
      { rotulo: 'Falar no WhatsApp', href: linkWhats() },
    ];
  }

  function linkWhats() {
    var partes = ['Olá! Vim pelo site.'];
    if (memoria.tipo) { partes.push('Quero o ' + nomeTipo(memoria.tipo) + '.'); }
    else if (memoria.vista === 'mar') { partes.push('Quero um apartamento com vista para o mar.'); }
    if (memoria.hospedes) { partes.push('Somos ' + memoria.hospedes + '.'); }
    if (memoria.datas) { partes.push('Datas: ' + memoria.datas + '.'); }
    return WA + '?text=' + encodeURIComponent(partes.join(' '));
  }

  function nomeTipo(chave) {
    var t = hotel && hotel.tipos[chave];
    return (t && t.nome) || ({ standard: 'Apartamento Standard', vistamar: 'Apartamento Vista Mar', familia: 'Apartamento Família' })[chave] || chave;
  }

  function dinheiro(v) { return 'R$ ' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  // ---------------------------------------------------------------- cerebro
  // Regras por palavra chave. Cada intencao tem um padrao e uma funcao que
  // escreve a resposta a partir da memoria da conversa. A ordem importa: ate
  // duas intencoes respondem na mesma mensagem, para "tem vaga e quanto custa"
  // nao perder a segunda metade.
  var INTENCOES = [
    { nome: 'humano', re: /whats|zap|atendente|pessoa\b|humano|falar com|telefone|ligar/i },
    { nome: 'eventos', re: /evento|festa|anivers[áa]rio|reuni[ãa]o|sal[ãa]o|confraterniza|casamento|treinamento/i },
    { nome: 'disponibilidade', re: /vaga|dispon[ií]vel|livre|tem apartamento|apartamento para|quero reservar|reserv|hospedar|fim de semana|feriado|f[ée]rias/i },
    { nome: 'preco', re: /pre[çc]o|di[áa]ria|valor|quanto|custa|tarifa|barat/i },
    { nome: 'cafe', re: /caf[ée]|manh[ãa]/i },
    { nome: 'cozinha', re: /cozinha|cozinhar|fog[ãa]o|geladeira|micro|panela/i },
    { nome: 'horario', re: /check|hor[áa]rio|entrada|sa[íi]da|que horas|cedo|tarde demais/i },
    { nome: 'estacionamento', re: /estacion|garagem|vaga de carro|onde paro|parar o carro/i },
    { nome: 'local', re: /onde|endere[çc]o|localiza|praia|chegar|fica|longe|perto|s[ãa]o paulo|imigrantes|anchieta|porchat|biquinha/i },
    { nome: 'wifi', re: /wi-?fi|internet/i },
    { nome: 'pet', re: /\bpet|cachorro|gato|animal/i },
    { nome: 'cancelamento', re: /cancel|pol[íi]tica|reembolso/i },
    { nome: 'obrigado', re: /obrigad|valeu|brigad/i },
    { nome: 'saudacao', re: /^(oi|ol[áa]|bom dia|boa tarde|boa noite|e a[íi])\b/i },
  ];

  // Devolve true quando a mensagem de agora trouxe hospedes, vista, tipo ou
  // datas: so entao "apartamento para 2" sem verbo vale como pedido de vaga.
  function lerMemoria(texto, memoria) {
    var antes = JSON.stringify(memoria);
    var t = texto.toLowerCase();
    var n = t.match(/(\d+)\s*(pessoas?|h[óo]spedes?|adultos?)/);
    if (n) { memoria.hospedes = Math.max(1, parseInt(n[1], 10)); }
    else if (/casal|dois|duas|\b2\b/.test(t)) { memoria.hospedes = 2; }
    else if (/seis|\b6\b/.test(t)) { memoria.hospedes = 6; }
    else if (/cinco|\b5\b/.test(t)) { memoria.hospedes = 5; }
    else if (/quatro|\b4\b/.test(t)) { memoria.hospedes = 4; }
    else if (/tr[êe]s|\b3\b/.test(t)) { memoria.hospedes = 3; }
    else if (/sozinh|uma pessoa|\b1\b/.test(t)) { memoria.hospedes = 1; }
    if (/vista|varanda|mar\b|de frente/.test(t)) { memoria.vista = 'mar'; }
    if (/cidade|mais barat/.test(t)) { memoria.vista = 'cidade'; }
    if (/fam[íi]lia|dois quartos|2 quartos/.test(t)) { memoria.tipo = 'familia'; }
    else if (/vista mar/.test(t)) { memoria.tipo = 'vistamar'; }
    else if (/standard/.test(t)) { memoria.tipo = 'standard'; }
    var d = t.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:\s*(?:a|at[ée]|-)\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?))?/);
    if (d) { memoria.datas = d[2] ? d[1] + ' até ' + d[2] : d[1]; }
    return JSON.stringify(memoria) !== antes;
  }

  function tiposQueServem(memoria) {
    if (!hotel) { return []; }
    return Object.keys(hotel.tipos).filter(function (k) {
      var t = hotel.tipos[k];
      if (memoria.tipo && memoria.tipo !== k) { return false; }
      if (memoria.hospedes && t.hosp < memoria.hospedes) { return false; }
      if (memoria.vista === 'mar' && !t.vistaMar) { return false; }
      if (memoria.vista === 'cidade' && t.vistaMar) { return false; }
      return true;
    });
  }

  function livresDoTipo(k) {
    var n = 0;
    hotel.andares.forEach(function (a) {
      a.apartamentos.forEach(function (q) {
        if (q.tipo === k && q.status === 'disponivel') { n += 1; }
      });
    });
    return n;
  }

  function linkTipo(k) {
    return '<a href="' + hotel.tipos[k].pagina + '">' + escapar(nomeTipo(k)) + '</a>';
  }

  function linhaTipo(k) {
    var t = hotel.tipos[k];
    return linkTipo(k) + ': ' + livresDoTipo(k) + ' livres, a partir de ' + dinheiro(t.base) + ', até ' + t.hosp + ' pessoas';
  }

  var RESPOSTAS = {
    saudacao: function () { return 'Olá! Em que posso ajudar?'; },
    obrigado: function () { return 'Por nada. Se quiser reservar, é só abrir o WhatsApp aqui embaixo.'; },
    humano: function () {
      return 'Claro. As reservas atendem pelo WhatsApp de segunda a sexta, das 9h às 18h, e a conversa já vai com o que você me contou. <a href="' + linkWhats() + '">Abrir o WhatsApp</a>';
    },
    disponibilidade: function (m) {
      if (!hotel) { return 'Não consegui carregar a lista de apartamentos. As reservas respondem pelo WhatsApp.'; }
      var tipos = tiposQueServem(m);
      if (!tipos.length) {
        if (m.hospedes && m.hospedes > 6) {
          return 'Um apartamento recebe até 6 pessoas. Para um grupo maior dá para juntar dois, um ao lado do outro; as reservas montam isso pelo WhatsApp.';
        }
        return 'Com essa combinação não tenho um tipo que sirva. O Família tem dois quartos e recebe até 6 pessoas; as reservas ajudam pelo WhatsApp.';
      }
      var intro = m.hospedes ? 'Para ' + m.hospedes + ' pessoas, hoje tenho:' : 'Hoje tenho livres:';
      return intro + '<ul>' + tipos.map(function (k) { return '<li>' + linhaTipo(k) + '</li>'; }).join('') + '</ul>'
        + 'Disponibilidade e diárias de demonstração; as reservas confirmam pelo WhatsApp.';
    },
    preco: function (m) {
      if (!hotel) { return 'Não consegui carregar a lista de apartamentos. As reservas respondem pelo WhatsApp.'; }
      var tipos = tiposQueServem(m);
      if (!tipos.length) { tipos = Object.keys(hotel.tipos); }
      return 'Diárias a partir de:<ul>' + tipos.map(function (k) {
        return '<li>' + linkTipo(k) + ': ' + dinheiro(hotel.tipos[k].base) + ' a diária</li>';
      }).join('') + '</ul>Valores de demonstração. Feriado e alta temporada mudam a diária.';
    },
    cafe: function () {
      return 'O café da manhã é servido no salão do térreo, com frutas, pães, frios, bolo e café passado na hora. <a href="cafe-e-estrutura.html">Ver o café e a estrutura</a>';
    },
    cozinha: function () {
      return 'Todos os apartamentos têm cozinha com fogão, geladeira, micro ondas e louça. Dá para fazer as refeições sem sair do prédio.';
    },
    eventos: function () {
      return 'Temos um salão de frente para a praia para reuniões, aniversários e confraternizações, e os convidados podem se hospedar no mesmo prédio. <a href="eventos.html">Ver eventos</a>';
    },
    horario: function () { return 'Check in a partir das 14h e check out até as 12h. As reservas atendem de segunda a sexta, das 9h às 18h.'; },
    estacionamento: function () { return 'Sobre estacionamento, quem responde é a equipe de reservas, pelo WhatsApp.'; },
    local: function () {
      return 'Ficamos na orla da Praia do Itararé, em São Vicente, com calçadão e ciclovia na porta. A Ilha Porchat fica no fim da praia. De São Paulo são cerca de 70 km pela Imigrantes. <a href="localizacao.html">Ver como chegar</a>';
    },
    wifi: function () { return 'Tem wifi nos apartamentos e nas áreas comuns, sem custo.'; },
    pet: function () { return 'Sobre animais de estimação, pergunte às reservas pelo WhatsApp antes de fechar.'; },
    cancelamento: function () { return 'A política de cancelamento vai junto com a confirmação da reserva, pelo WhatsApp.'; },
    naoEntendi: function () { return 'Não entendi essa. Posso falar de apartamentos livres, diárias, café da manhã, eventos, horários e como chegar. Para o resto, as reservas respondem pelo WhatsApp.'; },
  };

  function chipsDepois(nomes, m) {
    var lista = [];
    if (nomes.indexOf('disponibilidade') >= 0 || nomes.indexOf('preco') >= 0) {
      lista.push({ rotulo: 'Reservar pelo WhatsApp', href: linkWhats() });
      if (!m.vista) { lista.push({ rotulo: 'Tem vista para o mar?' }); }
      if (!m.hospedes) { lista.push({ rotulo: 'Somos um casal', texto: 'Apartamento para 2 pessoas' }); }
    } else {
      lista.push({ rotulo: 'Quais estão livres?' });
      lista.push({ rotulo: 'Quanto custa a diária?' });
      lista.push({ rotulo: 'Falar no WhatsApp', href: linkWhats() });
    }
    return lista;
  }

  // A unica porta do cerebro. Para trocar por um modelo de linguagem, esta
  // funcao passa a chamar uma rota propria e devolver o mesmo formato.
  function responder(texto, memoria) {
    var trouxeDados = lerMemoria(texto, memoria);
    var nomes = INTENCOES.filter(function (i) { return i.re.test(texto); }).map(function (i) { return i.nome; });
    if (nomes.length > 1) { nomes = nomes.filter(function (n) { return n !== 'saudacao'; }); }
    if (!nomes.length && trouxeDados) { nomes = ['disponibilidade']; }
    var usados = nomes.slice(0, 2);
    var respostas = usados.length
      ? usados.map(function (n) { return RESPOSTAS[n](memoria); })
      : [RESPOSTAS.naoEntendi(memoria)];
    return { respostas: respostas, chips: chipsDepois(usados, memoria) };
  }
})();
