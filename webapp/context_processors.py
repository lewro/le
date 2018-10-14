from webapp.models import Message

# The context processor function
def unread_messages(request):

  received_message       = Message.objects.filter(to_user=request.user.id, replied_date__isnull=True)
  unread_messages_count  = received_message.count()

  return {
      'unread_messages_count': unread_messages_count,
  }
