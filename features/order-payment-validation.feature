# language: fr
Fonctionnalité: Demande de paiement - validation des champs obligatoires
  En tant qu'équipe propriétaire de l'API Order
  Je veux que l'API rejette les payloads dont un champ obligatoire est manquant
  Afin qu'aucune demande de paiement invalide n'atteigne le terminal POS

  @negative @contract
  Plan du scénario: Un champ obligatoire manquant renvoie une erreur de validation 400
    Étant donné un payload dont le champ "<field>" est manquant
    Et je suis authentifié avec des identifiants valides
    Quand j'envoie la demande de paiement
    Alors le code de statut de la réponse doit être 400
    Et le code d'erreur doit être "required.openapi.requestValidation"
    Et le chemin de l'erreur doit être "<field>"

    Exemples:
      | field                                                       |
      | order.order_id                                              |
      | order.transaction_type                                      |
      | order.price.amount                                          |
      | order.price.currency                                        |
      | pos_technical_info.device_information.serial_number         |
      | pos_technical_info.terminal_transaction_display.protocol    |
