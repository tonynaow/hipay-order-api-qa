# language: fr
Fonctionnalité: Demande de paiement - terminal POS indisponible
  En tant qu'équipe propriétaire de l'API Order
  Je veux une erreur Bad Gateway claire quand le terminal POS est injoignable
  Afin que les appelants puissent réagir au lieu de rester bloqués indéfiniment

  @negative @resilience
  Scénario: Le terminal POS est déconnecté
    Étant donné un payload de paiement simulant un terminal POS déconnecté
    Et je suis authentifié avec des identifiants valides
    Quand j'envoie la demande de paiement
    Alors le code de statut de la réponse doit être 502
